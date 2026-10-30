# chat_cluster

A clustered chat built on Pitaya, with a React frontend. It shows the parts of
Pitaya that matter in a real game backend:

| Feature | Pitaya API |
|---|---|
| Frontend/backend split: one `connector` takes WebSockets, any number of `room` servers run the logic | `NewDefaultBuilder(isFrontend, ...)`, `acceptor.NewWSAcceptor` |
| Requests load-balanced across room servers, with each message tagged "via room-N" | default random router + etcd service discovery |
| Live online-user list shared by all servers | `groups.NewEtcdGroupService`, `GroupAddMember`, `GroupBroadcast` |
| Leave events | `SessionPool.OnSessionClose` (frontend only; backends cannot register `OnClose`) |
| Channels with unread badges, typing indicator | `notify` routes (no response) |
| Private messages | `SendPushToUsers` to two users |
| Admin kick | session data set on a backend + `PushToFront`, then `SendKickToUsers` |
| Cluster stats panel and failover | periodic `GroupBroadcast` from each room server, 5s etcd lease TTL |
| Load test | `pkg/client` bots over WebSocket |
| Metrics | Prometheus on `--metrics-port` |

## Run

Needs Docker (etcd + NATS), Go and Node. Run each command from the repo root,
in its own terminal:

```sh
make run-chat-cluster-connector                       # :3250 websocket, :9090 metrics
make run-chat-cluster-room                            # room-1, :9091 metrics
make run-chat-cluster-room NAME=room-2 METRICS_PORT=9092
make run-chat-cluster-frontend                        # http://localhost:5173
make run-chat-cluster-bots N=20                       # optional load
```

Open http://localhost:5173 in two tabs. To get admin (kick) rights, click
"Join as admin?" and use the key `pitaya`, or set another key with `--admin-key`.

### Things to try

- Watch the "via room-N" tag under messages change between servers.
- Stop a room server with Ctrl-C. Its card in **Cluster statistic** turns
  offline and the other servers keep handling messages. Start it again and it
  rejoins.
- Run the bots and watch msg/s climb in the stats ring.
- `curl localhost:9091/metrics | grep pitaya` to see a room server's metrics.

## Layout

```
main.go            server entrypoint (--type connector|room)
services/room.go   chat handlers (join, message, typing, dm, kick) and stats
services/connector.go  leave handling on the frontend
bots/main.go       load-test bots
frontend/          React + Vite client
```

`frontend/public/protocol.js` and `starx-wsclient.js` are copies of the
[pitaya-client-websocket](https://github.com/topfreegames/pitaya-client-websocket)
library with two fixes: UTF-8 now handles 4-byte characters (emoji), and kick
packets without a body no longer throw.
