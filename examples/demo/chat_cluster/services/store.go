package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

// Everything the chat persists lives in etcd under this prefix, so every room
// server sees the same data:
//
//	chat/guilds/<gid>                     Guild
//	chat/guilds/<gid>/channels/<cid>      Channel
//	chat/guilds/<gid>/members/<uid>       Member
//	chat/users/<uid>/guilds/<gid>         membership index
//	chat/invites/<code>                   gid
//	chat/messages/<cid>/<id>              Message
const prefix = "chat/"

const (
	// HistoryPage is how many messages a history request returns
	HistoryPage = 50
	// keepMessages is how many messages each channel keeps
	keepMessages = 500
	opTimeout    = 5 * time.Second
)

// Roles a member can have in a guild, from most to least powerful
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// DefaultGuildID is the guild every user joins automatically
const DefaultGuildID = "hq"

var (
	// ErrNotFound is returned when a guild, channel, member or message is missing
	ErrNotFound = errors.New("not found")
	// ErrConflict is returned when a concurrent update could not be applied
	ErrConflict = errors.New("too many concurrent updates, try again")
)

type (
	// Guild is a Discord-like server
	Guild struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Icon    string `json:"icon"`
		OwnerID string `json:"ownerId"`
		Invite  string `json:"invite"`
		Created int64  `json:"created"`
	}

	// Channel is a text channel inside a guild
	Channel struct {
		ID      string `json:"id"`
		GuildID string `json:"guildId"`
		Name    string `json:"name"`
		Topic   string `json:"topic"`
		Created int64  `json:"created"`
	}

	// Member is a user's membership in a guild
	Member struct {
		Name   string `json:"name"`
		Role   string `json:"role"`
		Joined int64  `json:"joined"`
	}

	// Message is a message posted in a channel
	Message struct {
		ID        string              `json:"id"`
		GuildID   string              `json:"guildId"`
		ChannelID string              `json:"channelId"`
		Author    string              `json:"author"`
		Content   string              `json:"content"`
		Mentions  []string            `json:"mentions,omitempty"`
		Reactions map[string][]string `json:"reactions,omitempty"`
		Server    string              `json:"server"`
		Ts        int64               `json:"ts"`
	}
)

// RoleRank orders roles so permissions can be compared
func RoleRank(role string) int {
	switch role {
	case RoleOwner:
		return 3
	case RoleAdmin:
		return 2
	case RoleMember:
		return 1
	}
	return 0
}

// Store persists guilds, channels, members and messages in etcd
type Store struct {
	cli *clientv3.Client
}

// NewStore returns a store backed by the given etcd client
func NewStore(cli *clientv3.Client) *Store {
	return &Store{cli: cli}
}

func newID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func guildKey(gid string) string         { return prefix + "guilds/" + gid }
func channelsPrefix(gid string) string   { return guildKey(gid) + "/channels/" }
func membersPrefix(gid string) string    { return guildKey(gid) + "/members/" }
func userGuildsPrefix(uid string) string { return prefix + "users/" + uid + "/guilds/" }
func inviteKey(code string) string       { return prefix + "invites/" + code }
func messagesPrefix(cid string) string   { return prefix + "messages/" + cid + "/" }

func (s *Store) ctx(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, opTimeout)
}

func (s *Store) getJSON(ctx context.Context, key string, v interface{}) error {
	ctx, cancel := s.ctx(ctx)
	defer cancel()
	res, err := s.cli.Get(ctx, key)
	if err != nil {
		return err
	}
	if len(res.Kvs) == 0 {
		return ErrNotFound
	}
	return json.Unmarshal(res.Kvs[0].Value, v)
}

func listJSON[T any](ctx context.Context, s *Store, keyPrefix string) ([]T, error) {
	ctx, cancel := s.ctx(ctx)
	defer cancel()
	res, err := s.cli.Get(ctx, keyPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, err
	}
	out := make([]T, 0, len(res.Kvs))
	for _, kv := range res.Kvs {
		var v T
		if err := json.Unmarshal(kv.Value, &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// EnsureDefaultGuild creates the default guild and its channels if missing
func (s *Store) EnsureDefaultGuild(ctx context.Context) error {
	now := time.Now().UnixMilli()
	g := Guild{ID: DefaultGuildID, Name: "Pitaya HQ", Icon: "🐉", Invite: "pitaya", Created: now}
	ops := []clientv3.Op{
		clientv3.OpPut(guildKey(g.ID), mustJSON(g)),
		clientv3.OpPut(inviteKey(g.Invite), g.ID),
	}
	defaults := []Channel{
		{Name: "general", Topic: "Talk about anything with everyone in the cluster"},
		{Name: "game", Topic: "Find teammates, plan matches, share your best plays"},
		{Name: "random", Topic: "Memes, off-topic and everything else"},
	}
	for i, c := range defaults {
		c.ID = fmt.Sprintf("hq-%s", c.Name)
		c.GuildID = g.ID
		c.Created = now + int64(i)
		ops = append(ops, clientv3.OpPut(channelsPrefix(g.ID)+c.ID, mustJSON(c)))
	}
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Txn(cctx).
		If(clientv3.Compare(clientv3.CreateRevision(guildKey(g.ID)), "=", 0)).
		Then(ops...).
		Commit()
	return err
}

// Guild returns a guild by ID
func (s *Store) Guild(ctx context.Context, gid string) (*Guild, error) {
	var g Guild
	if err := s.getJSON(ctx, guildKey(gid), &g); err != nil {
		return nil, err
	}
	return &g, nil
}

// AllGuildIDs lists every guild ID
func (s *Store) AllGuildIDs(ctx context.Context) ([]string, error) {
	ctx, cancel := s.ctx(ctx)
	defer cancel()
	res, err := s.cli.Get(ctx, prefix+"guilds/", clientv3.WithPrefix(), clientv3.WithKeysOnly())
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, kv := range res.Kvs {
		rest := strings.TrimPrefix(string(kv.Key), prefix+"guilds/")
		if !strings.Contains(rest, "/") {
			ids = append(ids, rest)
		}
	}
	return ids, nil
}

// CreateGuild creates a guild owned by uid with a #general channel
func (s *Store) CreateGuild(ctx context.Context, name, icon, uid string) (*Guild, error) {
	now := time.Now().UnixMilli()
	g := &Guild{ID: newID(6), Name: name, Icon: icon, OwnerID: uid, Invite: newID(4), Created: now}
	c := Channel{ID: newID(6), GuildID: g.ID, Name: "general", Topic: fmt.Sprintf("Welcome to %s", name), Created: now}
	m := Member{Name: uid, Role: RoleOwner, Joined: now}
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Txn(cctx).Then(
		clientv3.OpPut(guildKey(g.ID), mustJSON(g)),
		clientv3.OpPut(inviteKey(g.Invite), g.ID),
		clientv3.OpPut(channelsPrefix(g.ID)+c.ID, mustJSON(c)),
		clientv3.OpPut(membersPrefix(g.ID)+uid, mustJSON(m)),
		clientv3.OpPut(userGuildsPrefix(uid)+g.ID, ""),
	).Commit()
	if err != nil {
		return nil, err
	}
	return g, nil
}

// DeleteGuild removes a guild with all its channels, members and messages
func (s *Store) DeleteGuild(ctx context.Context, g *Guild) error {
	members, err := s.Members(ctx, g.ID)
	if err != nil {
		return err
	}
	channels, err := s.Channels(ctx, g.ID)
	if err != nil {
		return err
	}
	ops := []clientv3.Op{
		clientv3.OpDelete(guildKey(g.ID)),
		clientv3.OpDelete(guildKey(g.ID)+"/", clientv3.WithPrefix()),
		clientv3.OpDelete(inviteKey(g.Invite)),
	}
	for _, m := range members {
		ops = append(ops, clientv3.OpDelete(userGuildsPrefix(m.Name)+g.ID))
	}
	for _, c := range channels {
		ops = append(ops, clientv3.OpDelete(messagesPrefix(c.ID), clientv3.WithPrefix()))
	}
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err = s.cli.Txn(cctx).Then(ops...).Commit()
	return err
}

// GuildByInvite resolves an invite code to a guild
func (s *Store) GuildByInvite(ctx context.Context, code string) (*Guild, error) {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	res, err := s.cli.Get(cctx, inviteKey(code))
	if err != nil {
		return nil, err
	}
	if len(res.Kvs) == 0 {
		return nil, ErrNotFound
	}
	return s.Guild(ctx, string(res.Kvs[0].Value))
}

// UserGuildIDs lists the guilds a user belongs to
func (s *Store) UserGuildIDs(ctx context.Context, uid string) ([]string, error) {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	res, err := s.cli.Get(cctx, userGuildsPrefix(uid), clientv3.WithPrefix(), clientv3.WithKeysOnly())
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(res.Kvs))
	for _, kv := range res.Kvs {
		ids = append(ids, strings.TrimPrefix(string(kv.Key), userGuildsPrefix(uid)))
	}
	return ids, nil
}

// Member returns a user's membership in a guild
func (s *Store) Member(ctx context.Context, gid, uid string) (*Member, error) {
	var m Member
	if err := s.getJSON(ctx, membersPrefix(gid)+uid, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// Members lists a guild's members
func (s *Store) Members(ctx context.Context, gid string) ([]Member, error) {
	return listJSON[Member](ctx, s, membersPrefix(gid))
}

// PutMember adds or updates a membership
func (s *Store) PutMember(ctx context.Context, gid string, m Member) error {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Txn(cctx).Then(
		clientv3.OpPut(membersPrefix(gid)+m.Name, mustJSON(m)),
		clientv3.OpPut(userGuildsPrefix(m.Name)+gid, ""),
	).Commit()
	return err
}

// RemoveMember deletes a membership
func (s *Store) RemoveMember(ctx context.Context, gid, uid string) error {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Txn(cctx).Then(
		clientv3.OpDelete(membersPrefix(gid)+uid),
		clientv3.OpDelete(userGuildsPrefix(uid)+gid),
	).Commit()
	return err
}

// Channels lists a guild's channels, oldest first
func (s *Store) Channels(ctx context.Context, gid string) ([]Channel, error) {
	channels, err := listJSON[Channel](ctx, s, channelsPrefix(gid))
	if err != nil {
		return nil, err
	}
	slices.SortFunc(channels, func(a, b Channel) int { return int(a.Created - b.Created) })
	return channels, nil
}

// Channel returns one channel
func (s *Store) Channel(ctx context.Context, gid, cid string) (*Channel, error) {
	var c Channel
	if err := s.getJSON(ctx, channelsPrefix(gid)+cid, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// CreateChannel adds a channel to a guild
func (s *Store) CreateChannel(ctx context.Context, gid, name, topic string) (*Channel, error) {
	c := &Channel{ID: newID(6), GuildID: gid, Name: name, Topic: topic, Created: time.Now().UnixMilli()}
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	if _, err := s.cli.Put(cctx, channelsPrefix(gid)+c.ID, mustJSON(c)); err != nil {
		return nil, err
	}
	return c, nil
}

// DeleteChannel removes a channel and its messages
func (s *Store) DeleteChannel(ctx context.Context, gid, cid string) error {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Txn(cctx).Then(
		clientv3.OpDelete(channelsPrefix(gid)+cid),
		clientv3.OpDelete(messagesPrefix(cid), clientv3.WithPrefix()),
	).Commit()
	return err
}

// AddMessage stores a message, assigning its ID, and trims old history
func (s *Store) AddMessage(ctx context.Context, m *Message) error {
	// Zero-padded timestamps keep keys in chronological order.
	m.ID = fmt.Sprintf("%020d-%s", time.Now().UnixNano(), newID(3))
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	if _, err := s.cli.Put(cctx, messagesPrefix(m.ChannelID)+m.ID, mustJSON(m)); err != nil {
		return err
	}
	return s.trim(ctx, m.ChannelID)
}

func (s *Store) trim(ctx context.Context, cid string) error {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	count, err := s.cli.Get(cctx, messagesPrefix(cid), clientv3.WithPrefix(), clientv3.WithCountOnly())
	if err != nil || count.Count <= keepMessages+50 {
		return err
	}
	extra := count.Count - keepMessages
	old, err := s.cli.Get(cctx, messagesPrefix(cid), clientv3.WithPrefix(), clientv3.WithKeysOnly(),
		clientv3.WithSort(clientv3.SortByKey, clientv3.SortAscend), clientv3.WithLimit(extra))
	if err != nil || len(old.Kvs) == 0 {
		return err
	}
	last := string(old.Kvs[len(old.Kvs)-1].Key)
	_, err = s.cli.Delete(cctx, messagesPrefix(cid), clientv3.WithRange(last+"\x00"))
	return err
}

// History returns up to HistoryPage messages older than before ("" for the
// newest), oldest first
func (s *Store) History(ctx context.Context, cid, before string) ([]Message, error) {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	end := clientv3.GetPrefixRangeEnd(messagesPrefix(cid))
	if before != "" {
		end = messagesPrefix(cid) + before
	}
	res, err := s.cli.Get(cctx, messagesPrefix(cid), clientv3.WithRange(end),
		clientv3.WithSort(clientv3.SortByKey, clientv3.SortDescend), clientv3.WithLimit(HistoryPage))
	if err != nil {
		return nil, err
	}
	out := make([]Message, len(res.Kvs))
	for i, kv := range res.Kvs {
		if err := json.Unmarshal(kv.Value, &out[len(res.Kvs)-1-i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Message returns one message
func (s *Store) Message(ctx context.Context, cid, id string) (*Message, error) {
	var m Message
	if err := s.getJSON(ctx, messagesPrefix(cid)+id, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// DeleteMessage removes one message
func (s *Store) DeleteMessage(ctx context.Context, cid, id string) error {
	cctx, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.cli.Delete(cctx, messagesPrefix(cid)+id)
	return err
}

// ToggleReaction adds or removes uid's emoji reaction on a message. It retries
// on concurrent updates so two people reacting at once both count.
func (s *Store) ToggleReaction(ctx context.Context, cid, id, emoji, uid string) (*Message, error) {
	key := messagesPrefix(cid) + id
	for range 5 {
		cctx, cancel := s.ctx(ctx)
		res, err := s.cli.Get(cctx, key)
		if err != nil {
			cancel()
			return nil, err
		}
		if len(res.Kvs) == 0 {
			cancel()
			return nil, ErrNotFound
		}
		var m Message
		if err := json.Unmarshal(res.Kvs[0].Value, &m); err != nil {
			cancel()
			return nil, err
		}
		if m.Reactions == nil {
			m.Reactions = map[string][]string{}
		}
		users := m.Reactions[emoji]
		if i := slices.Index(users, uid); i >= 0 {
			users = slices.Delete(users, i, i+1)
		} else {
			users = append(users, uid)
		}
		if len(users) == 0 {
			delete(m.Reactions, emoji)
		} else {
			m.Reactions[emoji] = users
		}
		txn, err := s.cli.Txn(cctx).
			If(clientv3.Compare(clientv3.ModRevision(key), "=", res.Kvs[0].ModRevision)).
			Then(clientv3.OpPut(key, mustJSON(m))).
			Commit()
		cancel()
		if err != nil {
			return nil, err
		}
		if txn.Succeeded {
			return &m, nil
		}
	}
	return nil, ErrConflict
}
