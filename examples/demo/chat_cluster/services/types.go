package services

const (
	// FrontendType is the server type clients connect to
	FrontendType = "connector"
	// LobbyGroup holds every online user, across all guilds and servers
	LobbyGroup = "lobby"
)

// GuildGroup is the Pitaya group holding a guild's online members
func GuildGroup(gid string) string { return "guild:" + gid }

type (
	// JoinRequest is sent by the client to log in
	JoinRequest struct {
		Name     string `json:"name"`
		AdminKey string `json:"adminKey"`
	}

	// GuildSummary is a guild as seen by one member
	GuildSummary struct {
		Guild
		Role string `json:"role"`
	}

	// JoinResponse carries everything the client needs after login
	JoinResponse struct {
		Code   int            `json:"code"`
		Result string         `json:"result"`
		Name   string         `json:"name,omitempty"`
		Server string         `json:"server,omitempty"`
		Online []string       `json:"online,omitempty"`
		Guilds []GuildSummary `json:"guilds,omitempty"`
	}

	// Response is a generic request result
	Response struct {
		Code   int    `json:"code"`
		Result string `json:"result"`
	}

	// GuildRequest identifies a guild
	GuildRequest struct {
		GuildID string `json:"guildId"`
	}

	// MemberInfo is a member plus their presence
	MemberInfo struct {
		Member
		Online bool `json:"online"`
	}

	// GuildDetails is everything shown when opening a guild
	GuildDetails struct {
		Code     int          `json:"code"`
		Result   string       `json:"result"`
		Guild    GuildSummary `json:"guild"`
		Channels []Channel    `json:"channels"`
		Members  []MemberInfo `json:"members"`
	}

	// CreateGuildRequest creates a new guild
	CreateGuildRequest struct {
		Name string `json:"name"`
		Icon string `json:"icon"`
	}

	// JoinGuildRequest joins a guild by invite code
	JoinGuildRequest struct {
		Invite string `json:"invite"`
	}

	// GuildResponse returns one guild
	GuildResponse struct {
		Code   int           `json:"code"`
		Result string        `json:"result"`
		Guild  *GuildSummary `json:"guild,omitempty"`
	}

	// CreateChannelRequest adds a channel to a guild
	CreateChannelRequest struct {
		GuildID string `json:"guildId"`
		Name    string `json:"name"`
		Topic   string `json:"topic"`
	}

	// ChannelRequest identifies a channel
	ChannelRequest struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
	}

	// HistoryRequest asks for older messages in a channel
	HistoryRequest struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		Before    string `json:"before"`
	}

	// HistoryResponse returns a page of messages, oldest first
	HistoryResponse struct {
		Code     int       `json:"code"`
		Result   string    `json:"result"`
		Messages []Message `json:"messages"`
		More     bool      `json:"more"`
	}

	// SendMessageRequest posts a message in a channel
	SendMessageRequest struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		Content   string `json:"content"`
	}

	// MessageRequest identifies a message
	MessageRequest struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		ID        string `json:"id"`
	}

	// ReactRequest toggles a reaction on a message
	ReactRequest struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		ID        string `json:"id"`
		Emoji     string `json:"emoji"`
	}

	// MemberRequest targets a member of a guild
	MemberRequest struct {
		GuildID string `json:"guildId"`
		Name    string `json:"name"`
		Role    string `json:"role,omitempty"`
	}

	// DirectMessageRequest is sent by the client to message one user
	DirectMessageRequest struct {
		To      string `json:"to"`
		Content string `json:"content"`
	}

	// DirectMessage is pushed only to the sender and the recipient
	DirectMessage struct {
		From    string `json:"from"`
		To      string `json:"to"`
		Content string `json:"content"`
		Server  string `json:"server"`
		Ts      int64  `json:"ts"`
	}

	// Typing is pushed while a user composes a message
	Typing struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		Name      string `json:"name"`
	}

	// Presence is pushed to everyone when a user comes online or goes offline
	Presence struct {
		Name   string `json:"name"`
		Online bool   `json:"online"`
	}

	// MemberEvent is pushed when a guild's membership changes
	MemberEvent struct {
		GuildID string     `json:"guildId"`
		Member  MemberInfo `json:"member"`
	}

	// ChannelEvent is pushed when a channel is created or deleted
	ChannelEvent struct {
		GuildID string  `json:"guildId"`
		Channel Channel `json:"channel"`
	}

	// MessageDeleted is pushed when a message is removed
	MessageDeleted struct {
		GuildID   string `json:"guildId"`
		ChannelID string `json:"channelId"`
		ID        string `json:"id"`
	}

	// GuildRemoved tells a user they no longer belong to a guild
	GuildRemoved struct {
		GuildID string `json:"guildId"`
		Reason  string `json:"reason"`
	}

	// ServerStats is pushed periodically by every room server
	ServerStats struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Messages int64  `json:"messages"`
		Uptime   int64  `json:"uptime"`
		Users    int    `json:"users"`
	}
)
