package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	pitaya "github.com/topfreegames/pitaya/v3/pkg"
	"github.com/topfreegames/pitaya/v3/pkg/component"
	"github.com/topfreegames/pitaya/v3/pkg/constants"
	"github.com/topfreegames/pitaya/v3/pkg/logger"
)

const (
	statsInterval = 2 * time.Second
	maxContent    = 2000
)

var (
	mentionRe     = regexp.MustCompile(`@([^\s@]{1,24})`)
	channelNameRe = regexp.MustCompile(`[^a-z0-9_-]+`)
)

// Room handles all chat logic. It runs on backend servers; any number of them
// can run at once, and the connector picks one at random for each request.
type Room struct {
	component.Base
	app       pitaya.Pitaya
	store     *Store
	name      string
	adminKey  string
	startedAt time.Time
	messages  atomic.Int64
	stop      chan struct{}
}

// NewRoom returns a new Room
func NewRoom(app pitaya.Pitaya, store *Store, name, adminKey string) *Room {
	return &Room{
		app:      app,
		store:    store,
		name:     name,
		adminKey: adminKey,
		stop:     make(chan struct{}),
	}
}

// Init creates the default guild and the groups shared by all servers
func (r *Room) Init() {
	r.startedAt = time.Now()
	ctx := context.Background()
	if err := r.store.EnsureDefaultGuild(ctx); err != nil {
		logger.Log.Fatalf("failed to create default guild: %s", err)
	}
	for _, g := range []string{LobbyGroup, GuildGroup(DefaultGuildID)} {
		if err := r.ensureGroup(ctx, g); err != nil {
			logger.Log.Fatalf("failed to create group %s: %s", g, err)
		}
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
	r.broadcast(ctx, LobbyGroup, "onServerStats", &ServerStats{
		ID:       r.app.GetServerID(),
		Name:     r.name,
		Messages: r.messages.Load(),
		Uptime:   int64(time.Since(r.startedAt).Seconds()),
		Users:    users,
	})
}

func (r *Room) ensureGroup(ctx context.Context, group string) error {
	err := r.app.GroupCreate(ctx, group)
	if err != nil && !errors.Is(err, constants.ErrGroupAlreadyExists) {
		return err
	}
	return nil
}

func (r *Room) addToGroup(ctx context.Context, group, uid string) {
	if err := r.ensureGroup(ctx, group); err != nil {
		logger.Log.Errorf("failed to create group %s: %s", group, err)
		return
	}
	err := r.app.GroupAddMember(ctx, group, uid)
	if err != nil && !errors.Is(err, constants.ErrMemberAlreadyExists) {
		logger.Log.Errorf("failed to add %s to %s: %s", uid, group, err)
	}
}

func (r *Room) broadcast(ctx context.Context, group, route string, v interface{}) {
	if err := r.app.GroupBroadcast(ctx, FrontendType, group, route, v); err != nil {
		logger.Log.Errorf("broadcast %s to %s failed: %s", route, group, err)
	}
}

func (r *Room) push(uids []string, route string, v interface{}) {
	if failed, err := r.app.SendPushToUsers(route, v, uids, FrontendType); err != nil {
		logger.Log.Errorf("push %s to %v failed: %s", route, failed, err)
	}
}

func (r *Room) isOnline(ctx context.Context, uid string) bool {
	online, err := r.app.GroupContainsMember(ctx, LobbyGroup, uid)
	return err == nil && online
}

func fail(format string, args ...interface{}) *Response {
	return &Response{Code: 1, Result: fmt.Sprintf(format, args...)}
}

var ok = &Response{Code: 0, Result: "ok"}

// member returns the caller's UID and membership in the guild, or a response
// explaining why they cannot act on it.
func (r *Room) member(ctx context.Context, gid string) (string, *Member, *Response) {
	uid := r.app.GetSessionFromCtx(ctx).UID()
	if uid == "" {
		return "", nil, fail("not logged in")
	}
	m, err := r.store.Member(ctx, gid, uid)
	if errors.Is(err, ErrNotFound) {
		return uid, nil, fail("you are not a member of this server")
	}
	if err != nil {
		return uid, nil, fail("%s", err)
	}
	return uid, m, nil
}

func (r *Room) summaries(ctx context.Context, uid string) ([]GuildSummary, error) {
	ids, err := r.store.UserGuildIDs(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]GuildSummary, 0, len(ids))
	for _, gid := range ids {
		g, err := r.store.Guild(ctx, gid)
		if err != nil {
			continue
		}
		m, err := r.store.Member(ctx, gid, uid)
		if err != nil {
			continue
		}
		out = append(out, GuildSummary{Guild: *g, Role: m.Role})
	}
	return out, nil
}

// Join logs the session in under a nickname and subscribes it to its guilds
func (r *Room) Join(ctx context.Context, req *JoinRequest) (*JoinResponse, error) {
	s := r.app.GetSessionFromCtx(ctx)
	if s.UID() != "" {
		return &JoinResponse{Code: 1, Result: "already joined"}, nil
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || utf8.RuneCountInString(name) > 24 || strings.ContainsAny(name, " @/") {
		return &JoinResponse{Code: 1, Result: "nickname must be 1-24 characters without spaces, @ or /"}, nil
	}
	if r.isOnline(ctx, name) {
		return &JoinResponse{Code: 1, Result: fmt.Sprintf("%q is already online", name)}, nil
	}
	if err := s.Bind(ctx, name); err != nil {
		return nil, pitaya.Error(err, "CHAT-000", map[string]string{"failed": "bind"})
	}

	// Everyone belongs to the default guild; the admin key makes you an admin there.
	hq, err := r.store.Member(ctx, DefaultGuildID, name)
	newToHQ := errors.Is(err, ErrNotFound)
	if newToHQ {
		hq = &Member{Name: name, Role: RoleMember, Joined: time.Now().UnixMilli()}
	} else if err != nil {
		return nil, err
	}
	if r.adminKey != "" && req.AdminKey == r.adminKey && RoleRank(hq.Role) < RoleRank(RoleAdmin) {
		hq.Role = RoleAdmin
	}
	if err := r.store.PutMember(ctx, DefaultGuildID, *hq); err != nil {
		return nil, err
	}

	guilds, err := r.summaries(ctx, name)
	if err != nil {
		return nil, err
	}
	for _, g := range guilds {
		r.addToGroup(ctx, GuildGroup(g.ID), name)
	}
	r.addToGroup(ctx, LobbyGroup, name)
	online, err := r.app.GroupMembers(ctx, LobbyGroup)
	if err != nil {
		return nil, err
	}

	if newToHQ {
		r.broadcast(ctx, GuildGroup(DefaultGuildID), "onMemberJoined",
			&MemberEvent{GuildID: DefaultGuildID, Member: MemberInfo{Member: *hq, Online: true}})
	}
	r.broadcast(ctx, LobbyGroup, "onPresence", &Presence{Name: name, Online: true})

	return &JoinResponse{Code: 0, Result: "ok", Name: name, Server: r.name, Online: online, Guilds: guilds}, nil
}

// OpenGuild returns a guild's channels and members
func (r *Room) OpenGuild(ctx context.Context, req *GuildRequest) (*GuildDetails, error) {
	_, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return &GuildDetails{Code: 1, Result: res.Result}, nil
	}
	g, err := r.store.Guild(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	channels, err := r.store.Channels(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	members, err := r.store.Members(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	online, err := r.app.GroupMembers(ctx, LobbyGroup)
	if err != nil {
		return nil, err
	}
	isOnline := make(map[string]bool, len(online))
	for _, u := range online {
		isOnline[u] = true
	}
	infos := make([]MemberInfo, len(members))
	for i, m := range members {
		infos[i] = MemberInfo{Member: m, Online: isOnline[m.Name]}
	}
	return &GuildDetails{
		Code:     0,
		Result:   "ok",
		Guild:    GuildSummary{Guild: *g, Role: me.Role},
		Channels: channels,
		Members:  infos,
	}, nil
}

// History returns a page of a channel's messages
func (r *Room) History(ctx context.Context, req *HistoryRequest) (*HistoryResponse, error) {
	if _, _, res := r.member(ctx, req.GuildID); res != nil {
		return &HistoryResponse{Code: 1, Result: res.Result}, nil
	}
	if _, err := r.store.Channel(ctx, req.GuildID, req.ChannelID); err != nil {
		return &HistoryResponse{Code: 1, Result: "channel not found"}, nil
	}
	msgs, err := r.store.History(ctx, req.ChannelID, req.Before)
	if err != nil {
		return nil, err
	}
	return &HistoryResponse{Code: 0, Result: "ok", Messages: msgs, More: len(msgs) == HistoryPage}, nil
}

// Message posts a message in a channel and broadcasts it to the guild
func (r *Room) Message(ctx context.Context, req *SendMessageRequest) (*Response, error) {
	uid, _, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	content := strings.TrimSpace(req.Content)
	if content == "" || utf8.RuneCountInString(content) > maxContent {
		return fail("messages must be 1-%d characters", maxContent), nil
	}
	if _, err := r.store.Channel(ctx, req.GuildID, req.ChannelID); err != nil {
		return fail("channel not found"), nil
	}

	var mentions []string
	for _, m := range mentionRe.FindAllStringSubmatch(content, 5) {
		if _, err := r.store.Member(ctx, req.GuildID, m[1]); err == nil {
			mentions = append(mentions, m[1])
		}
	}

	msg := &Message{
		GuildID:   req.GuildID,
		ChannelID: req.ChannelID,
		Author:    uid,
		Content:   content,
		Mentions:  mentions,
		Server:    r.name,
		Ts:        time.Now().UnixMilli(),
	}
	if err := r.store.AddMessage(ctx, msg); err != nil {
		return nil, err
	}
	r.messages.Add(1)
	r.broadcast(ctx, GuildGroup(req.GuildID), "onMessage", msg)
	return ok, nil
}

// DeleteMessage removes a message; authors and admins may do it
func (r *Room) DeleteMessage(ctx context.Context, req *MessageRequest) (*Response, error) {
	uid, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	msg, err := r.store.Message(ctx, req.ChannelID, req.ID)
	if err != nil || msg.GuildID != req.GuildID {
		return fail("message not found"), nil
	}
	if msg.Author != uid && RoleRank(me.Role) < RoleRank(RoleAdmin) {
		return fail("you can only delete your own messages"), nil
	}
	if err := r.store.DeleteMessage(ctx, req.ChannelID, req.ID); err != nil {
		return nil, err
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onMessageDeleted",
		&MessageDeleted{GuildID: req.GuildID, ChannelID: req.ChannelID, ID: req.ID})
	return ok, nil
}

// React toggles the caller's emoji reaction on a message
func (r *Room) React(ctx context.Context, req *ReactRequest) (*Response, error) {
	uid, _, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if req.Emoji == "" || len(req.Emoji) > 32 {
		return fail("invalid emoji"), nil
	}
	msg, err := r.store.ToggleReaction(ctx, req.ChannelID, req.ID, req.Emoji, uid)
	if errors.Is(err, ErrNotFound) || (err == nil && msg.GuildID != req.GuildID) {
		return fail("message not found"), nil
	}
	if err != nil {
		return fail("%s", err), nil
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onReaction", msg)
	return ok, nil
}

// Typing tells the guild the caller is composing a message
func (r *Room) Typing(ctx context.Context, req *ChannelRequest) {
	uid, _, res := r.member(ctx, req.GuildID)
	if res != nil {
		return
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onTyping",
		&Typing{GuildID: req.GuildID, ChannelID: req.ChannelID, Name: uid})
}

// CreateGuild creates a guild owned by the caller
func (r *Room) CreateGuild(ctx context.Context, req *CreateGuildRequest) (*GuildResponse, error) {
	uid := r.app.GetSessionFromCtx(ctx).UID()
	if uid == "" {
		return &GuildResponse{Code: 1, Result: "not logged in"}, nil
	}
	name := strings.TrimSpace(req.Name)
	if n := utf8.RuneCountInString(name); n < 2 || n > 40 {
		return &GuildResponse{Code: 1, Result: "server names must be 2-40 characters"}, nil
	}
	icon := strings.TrimSpace(req.Icon)
	if icon == "" || len(icon) > 32 {
		icon = strings.ToUpper(string([]rune(name)[:1]))
	}
	g, err := r.store.CreateGuild(ctx, name, icon, uid)
	if err != nil {
		return nil, err
	}
	r.addToGroup(ctx, GuildGroup(g.ID), uid)
	return &GuildResponse{Code: 0, Result: "ok", Guild: &GuildSummary{Guild: *g, Role: RoleOwner}}, nil
}

// JoinGuild joins a guild by invite code
func (r *Room) JoinGuild(ctx context.Context, req *JoinGuildRequest) (*GuildResponse, error) {
	uid := r.app.GetSessionFromCtx(ctx).UID()
	if uid == "" {
		return &GuildResponse{Code: 1, Result: "not logged in"}, nil
	}
	code := strings.TrimSpace(req.Invite)
	if i := strings.LastIndex(code, "/"); i >= 0 {
		code = code[i+1:]
	}
	g, err := r.store.GuildByInvite(ctx, code)
	if errors.Is(err, ErrNotFound) {
		return &GuildResponse{Code: 1, Result: "invite is invalid or expired"}, nil
	}
	if err != nil {
		return nil, err
	}
	if m, err := r.store.Member(ctx, g.ID, uid); err == nil {
		return &GuildResponse{Code: 0, Result: "ok", Guild: &GuildSummary{Guild: *g, Role: m.Role}}, nil
	}

	m := Member{Name: uid, Role: RoleMember, Joined: time.Now().UnixMilli()}
	if err := r.store.PutMember(ctx, g.ID, m); err != nil {
		return nil, err
	}
	r.addToGroup(ctx, GuildGroup(g.ID), uid)
	r.broadcast(ctx, GuildGroup(g.ID), "onMemberJoined", &MemberEvent{GuildID: g.ID, Member: MemberInfo{Member: m, Online: true}})
	return &GuildResponse{Code: 0, Result: "ok", Guild: &GuildSummary{Guild: *g, Role: m.Role}}, nil
}

func (r *Room) removeMember(ctx context.Context, gid string, m *Member) error {
	if err := r.store.RemoveMember(ctx, gid, m.Name); err != nil {
		return err
	}
	_ = r.app.GroupRemoveMember(ctx, GuildGroup(gid), m.Name)
	r.broadcast(ctx, GuildGroup(gid), "onMemberLeft", &MemberEvent{GuildID: gid, Member: MemberInfo{Member: *m}})
	return nil
}

// LeaveGuild removes the caller from a guild
func (r *Room) LeaveGuild(ctx context.Context, req *GuildRequest) (*Response, error) {
	_, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if req.GuildID == DefaultGuildID {
		return fail("everyone stays in Pitaya HQ"), nil
	}
	if me.Role == RoleOwner {
		return fail("owners cannot leave; delete the server instead"), nil
	}
	if err := r.removeMember(ctx, req.GuildID, me); err != nil {
		return nil, err
	}
	return ok, nil
}

// DeleteGuild deletes a guild; only its owner may do it
func (r *Room) DeleteGuild(ctx context.Context, req *GuildRequest) (*Response, error) {
	uid, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if me.Role != RoleOwner {
		return fail("only the owner can delete this server"), nil
	}
	g, err := r.store.Guild(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	r.broadcast(ctx, GuildGroup(g.ID), "onGuildRemoved", &GuildRemoved{GuildID: g.ID, Reason: fmt.Sprintf("%s was deleted by %s", g.Name, uid)})
	if err := r.store.DeleteGuild(ctx, g); err != nil {
		return nil, err
	}
	_ = r.app.GroupDelete(ctx, GuildGroup(g.ID))
	return ok, nil
}

func channelName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, " ", "-")
	return strings.Trim(channelNameRe.ReplaceAllString(name, ""), "-")
}

// CreateChannel adds a channel; admins and the owner may do it
func (r *Room) CreateChannel(ctx context.Context, req *CreateChannelRequest) (*Response, error) {
	_, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if RoleRank(me.Role) < RoleRank(RoleAdmin) {
		return fail("only admins can create channels"), nil
	}
	name := channelName(req.Name)
	if name == "" || len(name) > 32 {
		return fail("channel names must be 1-32 letters, numbers, - or _"), nil
	}
	topic := strings.TrimSpace(req.Topic)
	if utf8.RuneCountInString(topic) > 120 {
		return fail("topics must be at most 120 characters"), nil
	}
	c, err := r.store.CreateChannel(ctx, req.GuildID, name, topic)
	if err != nil {
		return nil, err
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onChannelCreated", &ChannelEvent{GuildID: req.GuildID, Channel: *c})
	return ok, nil
}

// DeleteChannel removes a channel; admins and the owner may do it
func (r *Room) DeleteChannel(ctx context.Context, req *ChannelRequest) (*Response, error) {
	_, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if RoleRank(me.Role) < RoleRank(RoleAdmin) {
		return fail("only admins can delete channels"), nil
	}
	channels, err := r.store.Channels(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	if len(channels) <= 1 {
		return fail("a server needs at least one channel"), nil
	}
	c, err := r.store.Channel(ctx, req.GuildID, req.ChannelID)
	if err != nil {
		return fail("channel not found"), nil
	}
	if err := r.store.DeleteChannel(ctx, req.GuildID, req.ChannelID); err != nil {
		return nil, err
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onChannelDeleted", &ChannelEvent{GuildID: req.GuildID, Channel: *c})
	return ok, nil
}

// SetRole promotes or demotes a member; only the owner may do it
func (r *Room) SetRole(ctx context.Context, req *MemberRequest) (*Response, error) {
	_, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if me.Role != RoleOwner {
		return fail("only the owner can change roles"), nil
	}
	if req.Role != RoleAdmin && req.Role != RoleMember {
		return fail("role must be admin or member"), nil
	}
	target, err := r.store.Member(ctx, req.GuildID, req.Name)
	if err != nil {
		return fail("%s is not a member", req.Name), nil
	}
	if target.Role == RoleOwner {
		return fail("the owner's role cannot change"), nil
	}
	target.Role = req.Role
	if err := r.store.PutMember(ctx, req.GuildID, *target); err != nil {
		return nil, err
	}
	r.broadcast(ctx, GuildGroup(req.GuildID), "onMemberUpdated",
		&MemberEvent{GuildID: req.GuildID, Member: MemberInfo{Member: *target, Online: r.isOnline(ctx, target.Name)}})
	return ok, nil
}

// KickMember removes a member from a guild; you can only kick lower roles
func (r *Room) KickMember(ctx context.Context, req *MemberRequest) (*Response, error) {
	uid, me, res := r.member(ctx, req.GuildID)
	if res != nil {
		return res, nil
	}
	if req.GuildID == DefaultGuildID && RoleRank(me.Role) < RoleRank(RoleAdmin) {
		return fail("only admins can kick"), nil
	}
	target, err := r.store.Member(ctx, req.GuildID, req.Name)
	if err != nil {
		return fail("%s is not a member", req.Name), nil
	}
	if RoleRank(me.Role) < RoleRank(RoleAdmin) || RoleRank(me.Role) <= RoleRank(target.Role) {
		return fail("you cannot kick %s", req.Name), nil
	}
	g, err := r.store.Guild(ctx, req.GuildID)
	if err != nil {
		return nil, err
	}
	if err := r.removeMember(ctx, req.GuildID, target); err != nil {
		return nil, err
	}
	r.push([]string{target.Name}, "onGuildRemoved", &GuildRemoved{GuildID: g.ID, Reason: fmt.Sprintf("%s kicked you from %s", uid, g.Name)})
	return ok, nil
}

// DM sends a private message, pushed only to the sender and the recipient
func (r *Room) DM(ctx context.Context, req *DirectMessageRequest) (*Response, error) {
	uid := r.app.GetSessionFromCtx(ctx).UID()
	content := strings.TrimSpace(req.Content)
	if uid == "" || content == "" || utf8.RuneCountInString(content) > maxContent {
		return fail("invalid message"), nil
	}
	if !r.isOnline(ctx, req.To) {
		return fail("%s is not online", req.To), nil
	}

	r.messages.Add(1)
	dm := &DirectMessage{From: uid, To: req.To, Content: content, Server: r.name, Ts: time.Now().UnixMilli()}
	uids := []string{req.To}
	if req.To != uid {
		uids = append(uids, uid)
	}
	r.push(uids, "onDM", dm)
	return ok, nil
}
