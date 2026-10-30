# chat_cluster

A Discord-style chat built on a Pitaya cluster, with a React frontend. Users
create servers (guilds), invite friends, organise text channels, and moderate
with roles. Every request is handled by whichever room server the connector
picks, and all state lives in etcd, so room servers can come and go.

| Feature | How it works |
|---|---|
| Frontend/backend split: one `connector` takes WebSockets, any number of `room` servers run the logic | `NewDefaultBuilder(isFrontend, ...)`, `acceptor.NewWSAcceptor` |
| Requests load-balanced across room servers; each message is tagged "via room-N" | default random router + etcd service discovery |
| Servers, channels, members, roles, invites, message history (500 per channel) | `services/store.go`, an etcd-backed store shared by all room servers |
| Messages reach only a server's online members | one Pitaya group per guild (`guild:<id>`) + `GroupBroadcast` |
| Online/offline presence | `lobby` group; the connector broadcasts offline from `SessionPool.OnSessionClose` (backends cannot register `OnClose`) |
| Roles: owner, admin, member | owner promotes/demotes; admins create/delete channels, delete messages, kick lower roles |
| Reactions | optimistic etcd transaction so concurrent reactions all count |
| @mentions with autocomplete, unread and mention badges | server resolves mentions against guild members |
| Direct messages | `SendPushToUsers` to two users |
| Typing indicator | `notify` route (no response) |
| Cluster stats and failover | each room server broadcasts its stats every 2s; 5s etcd lease TTL |
| Load test | `pkg/client` bots over WebSocket |
| Metrics | Prometheus on `--metrics-port` |

There is no login: your nickname is your identity. Joining again with the same
nickname brings back your servers, roles and history. Only one session per
nickname can be online at a time.

## Run

Needs Docker (etcd + NATS), Go and Node. Run each command from the repo root,
in its own terminal:

```sh
make run-chat-cluster-connector                       # :3250 websocket, :9090 metrics
make run-chat-cluster-room                            # room-1, :9091 metrics
make run-chat-cluster-room NAME=room-2 METRICS_PORT=9092
make run-chat-cluster-frontend                        # http://localhost:5173
make run-chat-cluster-bots N=20                       # optional load in Pitaya HQ
```

Everyone joins **Pitaya HQ** (invite code `pitaya`). To be an admin there,
click "Join as Pitaya HQ admin?" and use the key `pitaya` (change it with
`--admin-key`). Anyone can create their own server with the **+** button and
becomes its owner.

### Things to try

- Open two browser tabs with different nicknames. Create a server in one,
  copy the invite from the server menu, and join it from the other.
- Type `@` in a channel to mention someone; the mentioned user gets a badge.
- Hover a message to react or delete it.
- As owner, click a member to make them admin or kick them.
- Stop a room server with Ctrl-C. Its chip in the Cluster card turns off and
  the other servers keep handling requests. Restart it and it rejoins.
- Restart everything: servers, channels and history are still there.

To wipe all chat data: `docker compose -f examples/testing/docker-compose.yml exec etcd etcdctl del --prefix chat/`.

## Layout

```
main.go                server entrypoint (--type connector|room)
services/store.go      etcd store: guilds, channels, members, invites, messages
services/room.go       request handlers (join, guilds, channels, messages, roles)
services/connector.go  group reset on start and offline handling
bots/main.go           load-test bots
frontend/              React + Vite client
```

`frontend/public/protocol.js` and `starx-wsclient.js` are copies of the
[pitaya-client-websocket](https://github.com/topfreegames/pitaya-client-websocket)
library with two fixes: UTF-8 now handles 4-byte characters (emoji), and kick
packets without a body no longer throw.
