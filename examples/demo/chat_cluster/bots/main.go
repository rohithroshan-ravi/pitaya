// Command bots connects many fake users to the chat and makes them talk,
// to show load being spread across room servers.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/topfreegames/pitaya/v3/examples/demo/chat_cluster/services"
	"github.com/topfreegames/pitaya/v3/pkg/client"
)

var (
	lines = []string{
		"gg", "anyone up for a match?", "lag on my side 😅", "nice play!", "brb",
		"who's winning?", "let's gooo", "that boss is tough", "lol", "rematch?",
		"pitaya handles this load easily", "hello from a bot 🤖",
	}
	// Channels of the default guild, see Store.EnsureDefaultGuild.
	channels = []string{"hq-general", "hq-game", "hq-random"}
	emojis   = []string{"👍", "😂", "🔥", "🎉", "❤️"}
)

func main() {
	addr := flag.String("addr", "localhost:3250", "connector websocket address")
	count := flag.Int("n", 20, "number of bots")
	interval := flag.Duration("interval", 3*time.Second, "average time between messages per bot")
	verbose := flag.Bool("v", false, "print everything the first bot receives")
	flag.Parse()

	stop := make(chan struct{})
	var wg sync.WaitGroup
	for i := 1; i <= *count; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			if err := runBot(*addr, fmt.Sprintf("bot-%02d", id), *interval, *verbose && id == 1, stop); err != nil {
				log.Printf("bot-%02d: %s", id, err)
			}
		}(i)
		time.Sleep(50 * time.Millisecond)
	}
	log.Printf("%d bots running against %s, Ctrl-C to stop", *count, *addr)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	<-sig
	close(stop)
	wg.Wait()
}

func runBot(addr, name string, interval time.Duration, verbose bool, stop <-chan struct{}) error {
	c := client.New(logrus.WarnLevel)
	if err := c.ConnectToWS(addr, "/"); err != nil {
		return err
	}
	defer c.Disconnect()

	// Pushes must be drained or the client's incoming buffer fills up. Now and
	// then a bot reacts to someone else's message; the react is handed to the
	// main loop because the client must not be written from two goroutines.
	reactions := make(chan services.ReactRequest, 8)
	go func() {
		for m := range c.MsgChannel() {
			if verbose {
				log.Printf("%s <- %s %s", name, m.Route, m.Data)
			}
			if m.Route != "onMessage" || rand.Float64() > 0.08 {
				continue
			}
			var msg services.Message
			if json.Unmarshal(m.Data, &msg) != nil || msg.Author == name {
				continue
			}
			select {
			case reactions <- services.ReactRequest{GuildID: msg.GuildID, ChannelID: msg.ChannelID, ID: msg.ID, Emoji: emojis[rand.IntN(len(emojis))]}:
			default:
			}
		}
	}()

	join, _ := json.Marshal(&services.JoinRequest{Name: name})
	if _, err := c.SendRequest("room.room.join", join); err != nil {
		return err
	}

	for {
		wait := time.Duration(float64(interval) * (0.5 + rand.Float64()))
		select {
		case <-stop:
			return nil
		case r := <-reactions:
			data, _ := json.Marshal(&r)
			if _, err := c.SendRequest("room.room.react", data); err != nil {
				return err
			}
			continue
		case <-time.After(wait):
		}

		channel := channels[rand.IntN(len(channels))]
		typing, _ := json.Marshal(&services.ChannelRequest{GuildID: services.DefaultGuildID, ChannelID: channel})
		if err := c.SendNotify("room.room.typing", typing); err != nil {
			return err
		}
		time.Sleep(time.Duration(300+rand.IntN(900)) * time.Millisecond)

		msg, _ := json.Marshal(&services.SendMessageRequest{
			GuildID:   services.DefaultGuildID,
			ChannelID: channel,
			Content:   lines[rand.IntN(len(lines))],
		})
		if _, err := c.SendRequest("room.room.message", msg); err != nil {
			return err
		}
	}
}
