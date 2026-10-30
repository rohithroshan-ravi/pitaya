package services

import (
	"context"

	pitaya "github.com/topfreegames/pitaya/v3/pkg"
	"github.com/topfreegames/pitaya/v3/pkg/logger"
	"github.com/topfreegames/pitaya/v3/pkg/session"
)

// ResetGroups clears group membership left over from a previous run (e.g. a
// crash), since nobody is connected to a connector that just started.
func ResetGroups(ctx context.Context, app pitaya.Pitaya, store *Store) error {
	ids, err := store.AllGuildIDs(ctx)
	if err != nil {
		return err
	}
	groups := []string{LobbyGroup}
	for _, id := range ids {
		groups = append(groups, GuildGroup(id))
	}
	for _, g := range groups {
		_ = app.GroupDelete(ctx, g)
		if err := app.GroupCreate(ctx, g); err != nil {
			return err
		}
	}
	return nil
}

// OnSessionClose takes the user out of every group and tells everyone they
// went offline. It must run on the frontend: backends cannot register OnClose
// callbacks.
func OnSessionClose(app pitaya.Pitaya, store *Store) func(s session.Session) {
	return func(s session.Session) {
		uid := s.UID()
		if uid == "" {
			return
		}
		ctx := context.Background()
		if err := app.GroupRemoveMember(ctx, LobbyGroup, uid); err != nil {
			logger.Log.Errorf("failed to remove %s from lobby: %s", uid, err)
		}
		gids, err := store.UserGuildIDs(ctx, uid)
		if err != nil {
			logger.Log.Errorf("failed to list guilds of %s: %s", uid, err)
		}
		for _, gid := range gids {
			_ = app.GroupRemoveMember(ctx, GuildGroup(gid), uid)
		}
		if err := app.GroupBroadcast(ctx, FrontendType, LobbyGroup, "onPresence", &Presence{Name: uid}); err != nil {
			logger.Log.Errorf("failed to broadcast %s going offline: %s", uid, err)
		}
	}
}
