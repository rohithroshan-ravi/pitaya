package services

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	pitaya "github.com/topfreegames/pitaya/v3/pkg"
	"github.com/topfreegames/pitaya/v3/pkg/component"
	"github.com/topfreegames/pitaya/v3/pkg/constants"
	"github.com/topfreegames/pitaya/v3/pkg/logger"
)

const statsInterval = 2 * time.Second

// Room handles all chat logic. It runs on backend servers; any number of them
// can run at once, and the connector picks one at random for each request.
type Room struct {
	component.Base
	app       pitaya.Pitaya
	name      string
	adminKey  string
	startedAt time.Time
	messages  atomic.Int64
	stop      chan struct{}
}

// NewRoom returns a new Room
func NewRoom(app pitaya.Pitaya, name, adminKey string) *Room {
	return &Room{
		app:      app,
		name:     name,
		adminKey: adminKey,
		stop:     make(chan struct{}),
	}
}

// Init creates the lobby group shared by all servers
func (r *Room) Init() {
	r.startedAt = time.Now()
	err := r.app.GroupCreate(context.Background(), LobbyGroup)
	if err != nil && !errors.Is(err, constants.ErrGroupAlreadyExists) {
		logger.Log.Fatalf("failed to create lobby group: %s", err)
	}
}

// AfterInit starts publishing this server's stats
func (r *Room) AfterInit() {
	go func() {
		ticker := time.NewTicker(statsInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				r.publishStats()
			case <-r.stop:
				return
			}
		}
	}()
}

// Shutdown stops publishing stats
func (r *Room) Shutdown() {
	close(r.stop)
}

func (r *Room) publishStats() {
	ctx := context.Background()
	users, err := r.app.GroupCountMembers(ctx, LobbyGroup)
	if err != nil || users == 0 {
		return
	}
	r.broadcast(ctx, "onServerStats", &ServerStats{
		ID:       r.app.GetServerID(),
		Name:     r.name,
		Messages: r.messages.Load(),
		Uptime:   int64(time.Since(r.startedAt).Seconds()),
		Users:    users,
	})
}

func (r *Room) broadcast(ctx context.Context, route string, v interface{}) {
	if err := r.app.GroupBroadcast(ctx, FrontendType, LobbyGroup, route, v); err != nil {
		logger.Log.Errorf("broadcast %s failed: %s", route, err)
	}
}

// Join binds the session to the chosen nickname and adds it to the lobby
func (r *Room) Join(ctx context.Context, req *JoinRequest) (*JoinResponse, error) {
	s := r.app.GetSessionFromCtx(ctx)
	if s.UID() != "" {
		return &JoinResponse{Code: 1, Result: "already joined"}, nil
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 24 {
		return &JoinResponse{Code: 1, Result: "nickname must be 1-24 characters"}, nil
	}

	taken, err := r.app.GroupContainsMember(ctx, LobbyGroup, name)
	if err != nil {
		return nil, err
	}
	if taken {
		return &JoinResponse{Code: 1, Result: fmt.Sprintf("nickname %q is already taken", name)}, nil
	}

	if err := s.Bind(ctx, name); err != nil {
		return nil, pitaya.Error(err, "CHAT-000", map[string]string{"failed": "bind"})
	}

	// Session data set on a backend lives only for this request unless it is
	// pushed back to the frontend, which forwards it with every later request.
	admin := r.adminKey != "" && req.AdminKey == r.adminKey
	if err := s.Set("admin", admin); err != nil {
		return nil, err
	}
	if err := s.PushToFront(ctx); err != nil {
		return nil, err
	}

	if err := r.app.GroupAddMember(ctx, LobbyGroup, name); err != nil {
		return nil, err
	}
	users, err := r.app.GroupMembers(ctx, LobbyGroup)
	if err != nil {
		return nil, err
	}

	r.broadcast(ctx, "onUserJoined", &UserEvent{Name: name, Server: r.name})

	return &JoinResponse{
		Code:     0,
		Result:   "ok",
		Name:     name,
		Admin:    admin,
		Server:   r.name,
		Users:    users,
		Channels: Channels,
	}, nil
}

// Message broadcasts a channel message to everyone
func (r *Room) Message(ctx context.Context, msg *ChannelMessage) {
	s := r.app.GetSessionFromCtx(ctx)
	content := strings.TrimSpace(msg.Content)
	if s.UID() == "" || content == "" || !slices.Contains(Channels, msg.Channel) {
		return
	}
	r.messages.Add(1)
	r.broadcast(ctx, "onMessage", &ChatMessage{
		Channel: msg.Channel,
		Name:    s.UID(),
		Content: content,
		Server:  r.name,
		Ts:      time.Now().UnixMilli(),
	})
}

// Typing tells everyone the user is composing a message
func (r *Room) Typing(ctx context.Context, req *TypingRequest) {
	s := r.app.GetSessionFromCtx(ctx)
	if s.UID() == "" || !slices.Contains(Channels, req.Channel) {
		return
	}
	r.broadcast(ctx, "onTyping", &Typing{Channel: req.Channel, Name: s.UID()})
}

// DM sends a private message, pushed only to the sender and the recipient
func (r *Room) DM(ctx context.Context, req *DirectMessageRequest) (*Response, error) {
	s := r.app.GetSessionFromCtx(ctx)
	content := strings.TrimSpace(req.Content)
	if s.UID() == "" || content == "" {
		return &Response{Code: 1, Result: "invalid message"}, nil
	}
	online, err := r.app.GroupContainsMember(ctx, LobbyGroup, req.To)
	if err != nil {
		return nil, err
	}
	if !online {
		return &Response{Code: 1, Result: fmt.Sprintf("%s is not online", req.To)}, nil
	}

	r.messages.Add(1)
	dm := &DirectMessage{
		From:    s.UID(),
		To:      req.To,
		Content: content,
		Server:  r.name,
		Ts:      time.Now().UnixMilli(),
	}
	uids := []string{req.To}
	if req.To != s.UID() {
		uids = append(uids, s.UID())
	}
	if failed, err := r.app.SendPushToUsers("onDM", dm, uids, FrontendType); err != nil {
		logger.Log.Errorf("dm push failed for %v: %s", failed, err)
	}
	return &Response{Code: 0, Result: "ok"}, nil
}

// Kick removes a user from the chat; only admins may call it
func (r *Room) Kick(ctx context.Context, req *KickRequest) (*Response, error) {
	s := r.app.GetSessionFromCtx(ctx)
	if admin, _ := s.Get("admin").(bool); !admin {
		return &Response{Code: 1, Result: "only admins can kick"}, nil
	}
	if req.Name == s.UID() {
		return &Response{Code: 1, Result: "you cannot kick yourself"}, nil
	}
	online, err := r.app.GroupContainsMember(ctx, LobbyGroup, req.Name)
	if err != nil {
		return nil, err
	}
	if !online {
		return &Response{Code: 1, Result: fmt.Sprintf("%s is not online", req.Name)}, nil
	}

	r.broadcast(ctx, "onNotice", &Notice{Text: fmt.Sprintf("%s was kicked by %s", req.Name, s.UID())})
	// Kick packets carry no reason, so tell the user who kicked them first.
	if _, err := r.app.SendPushToUsers("onKicked", &Notice{Text: s.UID()}, []string{req.Name}, FrontendType); err != nil {
		logger.Log.Errorf("failed to notify %s of kick: %s", req.Name, err)
	}
	// The connector removes the user from the lobby when the session closes.
	if _, err := r.app.SendKickToUsers([]string{req.Name}, FrontendType); err != nil {
		return nil, err
	}
	return &Response{Code: 0, Result: "ok"}, nil
}
