package services

import (
	"context"

	pitaya "github.com/topfreegames/pitaya/v3/pkg"
	"github.com/topfreegames/pitaya/v3/pkg/logger"
	"github.com/topfreegames/pitaya/v3/pkg/session"
)

// OnSessionClose removes the user from the lobby and tells everyone they left.
// It must run on the frontend: backends cannot register OnClose callbacks.
func OnSessionClose(app pitaya.Pitaya) func(s session.Session) {
	return func(s session.Session) {
		uid := s.UID()
		if uid == "" {
			return
		}
		ctx := context.Background()
		if err := app.GroupRemoveMember(ctx, LobbyGroup, uid); err != nil {
			logger.Log.Errorf("failed to remove %s from lobby: %s", uid, err)
		}
		if err := app.GroupBroadcast(ctx, FrontendType, LobbyGroup, "onUserLeft", &UserEvent{Name: uid}); err != nil {
			logger.Log.Errorf("failed to broadcast leave of %s: %s", uid, err)
		}
	}
}
