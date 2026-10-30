package services

const (
	// FrontendType is the server type clients connect to
	FrontendType = "connector"
	// LobbyGroup holds every user that joined the chat, across all servers
	LobbyGroup = "lobby"
)

// Channels are the chat channels a message can be sent to
var Channels = []string{"general", "game", "random"}

type (
	// JoinRequest is sent by the client to enter the chat
	JoinRequest struct {
		Name     string `json:"name"`
		AdminKey string `json:"adminKey"`
	}

	// JoinResponse carries everything the client needs to render the chat
	JoinResponse struct {
		Code     int      `json:"code"`
		Result   string   `json:"result"`
		Name     string   `json:"name,omitempty"`
		Admin    bool     `json:"admin"`
		Server   string   `json:"server,omitempty"`
		Users    []string `json:"users,omitempty"`
		Channels []string `json:"channels,omitempty"`
	}

	// Response is a generic request result
	Response struct {
		Code   int    `json:"code"`
		Result string `json:"result"`
	}

	// ChannelMessage is sent by the client to a channel
	ChannelMessage struct {
		Channel string `json:"channel"`
		Content string `json:"content"`
	}

	// ChatMessage is pushed to every user when someone posts in a channel
	ChatMessage struct {
		Channel string `json:"channel"`
		Name    string `json:"name"`
		Content string `json:"content"`
		Server  string `json:"server"`
		Ts      int64  `json:"ts"`
	}

	// TypingRequest is sent by the client while composing a message
	TypingRequest struct {
		Channel string `json:"channel"`
	}

	// Typing is pushed to everyone when a user is typing
	Typing struct {
		Channel string `json:"channel"`
		Name    string `json:"name"`
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

	// KickRequest is sent by an admin to remove a user
	KickRequest struct {
		Name string `json:"name"`
	}

	// UserEvent is pushed when a user joins or leaves
	UserEvent struct {
		Name   string `json:"name"`
		Server string `json:"server,omitempty"`
	}

	// Notice is a system message shown to everyone
	Notice struct {
		Text string `json:"text"`
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
