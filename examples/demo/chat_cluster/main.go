package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand/v2"
	"strings"
	"time"

	"github.com/topfreegames/pitaya/v3/examples/demo/chat_cluster/services"
	pitaya "github.com/topfreegames/pitaya/v3/pkg"
	"github.com/topfreegames/pitaya/v3/pkg/acceptor"
	"github.com/topfreegames/pitaya/v3/pkg/component"
	"github.com/topfreegames/pitaya/v3/pkg/config"
	"github.com/topfreegames/pitaya/v3/pkg/groups"
	"github.com/topfreegames/pitaya/v3/pkg/logger"
)

func main() {
	svType := flag.String("type", services.FrontendType, "server type: connector or room")
	port := flag.Int("port", 3250, "websocket port (connector only)")
	name := flag.String("name", "", "display name of a room server (default room-<random>)")
	adminKey := flag.String("admin-key", "pitaya", "key that grants admin (kick) rights on join; empty disables admins")
	metricsPort := flag.Int("metrics-port", 0, "prometheus metrics port, 0 disables")
	flag.Parse()

	isFrontend := *svType == services.FrontendType
	if !isFrontend && *svType != "room" {
		logger.Log.Fatalf("unknown server type %q", *svType)
	}
	if *name == "" {
		*name = fmt.Sprintf("room-%03d", rand.IntN(1000))
	}

	conf := config.NewDefaultPitayaConfig()
	conf.Heartbeat.Interval = 15 * time.Second
	conf.Handler.Messages.Compression = false
	// A short lease means a crashed room server leaves the cluster within seconds.
	conf.Cluster.SD.Etcd.Heartbeat.TTL = 5 * time.Second
	if *metricsPort != 0 {
		conf.Metrics.Prometheus.Enabled = true
		conf.Metrics.Prometheus.Port = *metricsPort
	}

	builder := pitaya.NewDefaultBuilder(isFrontend, *svType, pitaya.Cluster, map[string]string{"name": *name}, *conf)

	// etcd-backed groups so every server sees the same lobby members.
	gs, err := groups.NewEtcdGroupService(conf.Groups.Etcd, nil)
	if err != nil {
		logger.Log.Fatalf("failed to create etcd group service: %s", err)
	}
	builder.Groups = gs

	if isFrontend {
		builder.AddAcceptor(acceptor.NewWSAcceptor(fmt.Sprintf(":%d", *port)))
	}

	app := builder.Build()
	defer app.Shutdown()

	if isFrontend {
		// Members left over from a previous run (e.g. a crash) are stale.
		ctx := context.Background()
		_ = app.GroupDelete(ctx, services.LobbyGroup)
		if err := app.GroupCreate(ctx, services.LobbyGroup); err != nil {
			logger.Log.Fatalf("failed to create lobby group: %s", err)
		}
		builder.SessionPool.OnSessionClose(services.OnSessionClose(app))
	} else {
		app.Register(services.NewRoom(app, *name, *adminKey),
			component.WithName("room"),
			component.WithNameFunc(strings.ToLower),
		)
	}

	app.Start()
}
