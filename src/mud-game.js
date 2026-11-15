import { LitElement, html, css } from 'lit';
import { initMuxAudio, preloadAmbient, playSound, stopAudio } from './audio.js';
import { loadPlayer, createPlayer, savePlayer } from './db.js';

const START_ROOM = 'entrance';

// Note: String.raw keeps the backslashes literal; don't use backticks or ${ in the art.
const TITLE_ART = String.raw`
  __  __ _   _ ____        _   _  ___  _     _____
 |  \/  | | | |  _ \      | | | |/ _ \| |   | ____|
 | |\/| | | | | | | |_____| |_| | | | | |   |  _|
 | |  | | |_| | |_| |_____|  _  | |_| | |___| |___
 |_|  |_|\___/|____/      |_| |_|\___/|_____|_____|

          |            .             |
          '            |             '
                       '
   ~,.~'~,.~~'~.,~~'~.,o~'~.,~~'~.,~~'~.,~~'~.,
  '~.,__.~'~.,____________________.,~'~.,__.~'~.,_
        .-'~  ~   ~    ~     ~   ~  ~ '-.
      .'   ~    ~   ~     ~    ~    ~    '.
     /  ~     .-.             .-.    ~     \
    |    ~    |@|    ~    ~   |@|      ~    |
    |  ~    ~  '-'   \_____/   '-'   ~   ~  |
     \    ~   ~    ~  \vvvvv/  ~     ~     /
      '.  ~    ~   ~     '''    ~   ~     .'
        '-.__  ~    ~    ~    ~    __.-'
             ''--.___________.--''
`;

export class MudGame extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: monospace;
      background: #121212;
      color: #00ff66;
      padding: 20px;
      height: 100vh;
      box-sizing: border-box;
    }
    .terminal {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .output {
      flex: 1;
      background: #000;
      border: 1px solid #00ff66;
      padding: 15px;
      overflow-y: auto;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }
    .input-box {
      display: flex;
      gap: 10px;
    }
    input {
      flex: 1;
      background: #000;
      border: 1px solid #00ff66;
      color: #00ff66;
      padding: 10px;
      font-family: monospace;
      font-size: 1rem;
    }
    button {
      background: #00ff66;
      color: #000;
      border: none;
      padding: 0 20px;
      font-weight: bold;
      cursor: pointer;
    }
  `;

  static properties = {
    logs: { type: Array },
    currentRoomId: { type: String },
    audioInitialized: { type: Boolean },
    player: { type: Object }
  };

  constructor() {
    super();
    this.audioInitialized = false;
    this.player = null;
    // Resolves once we know whether this browser has a registered player (IndexedDB)
    this.playerLoaded = loadPlayer().then((player) => {
      this.player = player;
    });

    // Define your world map
    this.rooms = {
      title: {
        name: "Mud hole",
        description: `${TITLE_ART}\nA dark hole in the ground waits below. Type 'enter' to descend.`,
        transient: true, // never saved as the player's location
        // Strangers are sent to the clerk to register; known players are welcomed back
        // and resume where they left off
        exits: { enter: () => this.resumeDestination() },
        // Strudel ambient pattern: Soft filtered noise for wind/air + gentle high notes for bird calls
        ambient: 's("birds, birds3")'
      },
      clerk: {
        name: "Registration Desk",
        description:
          "A cramped booth lit by a single guttering candle. A weary clerk peers at you over cracked spectacles and slides a thick ledger across the counter.\n" +
          "\"Name?\" he rasps. \"Type it and I'll sign you in.\"",
        exits: {},
        transient: true,
        ambient: 's("hh").struct("x ~ ~ x").slow(2).gain(0.1).room(0.3)',
        // Anything typed here (other than 'look') is taken as the player's name
        onInput: async (raw) => {
          const name = raw.replace(/\s+/g, ' ');
          if (!/^[\w -]{2,20}$/.test(name)) {
            this.appendLog(`> ${raw}\nThe clerk squints. "Letters, numbers, spaces and dashes only, 2 to 20 of them."`);
            return;
          }
          this.player = await savePlayer(createPlayer(name, START_ROOM));
          this.appendLog(`> ${raw}\nThe clerk scratches "${name}" into the ledger. "Welcome to the hole. Off you go."`);
          this.enterRoom('entrance');
        }
      },
      entrance: {
        name: "Dungeon Entrance",
        description: "A heavy iron gate blocks the surface world behind you. Cold air drafts upward.",
        exits: { stairs: "stairs" },
        // Strudel ambient pattern: Soft filtered noise for wind/air + gentle high notes for bird calls
        //ambient: 's("white").note("g5 c6 e6").slow(6).room(0.7).gain(0.2).lpf(3000)'
        ambient: 's("birds, birds3")'
        //ambient: 's("cp, hh").struct("x ~ [~ x] ~").slow(3).room(0.5).gain(0.15)'
      },
      stairs: {
        name: "Dungeon Stairs",
        description: "Dark, slick stone steps descending into darkness. You hear echoes bouncing off unseen walls.",
        exits: { up: "entrance", chamber: "chamber" },
        // Strudel ambient pattern: a slow, cavernous drip/sine tone with heavy reverb & delay
        ambient: 's("sine").note("c1").slow(4).room(0.95).delay(0.4).cutoff(400)'
      },
      chamber: {
        name: "Damp Chamber",
        description: "Puddles pool on the floor. Water droplets hit the stagnant water rhythmically from the ceiling.",
        exits: { stairs: "stairs" },
        // Faster dripping ambient loop
        ambient: 's("bd").struct("[~ ~ x ~]").slow(2).room(0.9).gain(0.4).lpf(800)'
      }
    };

    this.currentRoomId = "title";
    // The title screen is the first thing the player sees
    this.logs = [
      `${this.describeRoom("title")}\n\n(Click anywhere to initialize audio)`
    ];
  }

  describeRoom(roomId) {
    const room = this.rooms[roomId];
    const exits = Object.keys(room.exits).join(', ') || 'none';
    return `=== ${room.name} ===\n${room.description}\nExits: ${exits}`;
  }

  /** Where 'enter' on the title screen leads: the clerk for strangers, the saved room for known players. */
  resumeDestination() {
    if (!this.player) return 'clerk';
    const saved = this.rooms[this.player.location];
    const destination = saved && !saved.transient ? this.player.location : START_ROOM;
    this.appendLog(`Welcome back, ${this.player.name}.`);
    return destination;
  }

  async appendLog(text) {
    this.logs = [...this.logs, text];
    await this.updateComplete;
    const outputDiv = this.shadowRoot.querySelector('.output');
    if (outputDiv) outputDiv.scrollTop = outputDiv.scrollHeight;
  }

  async handleAudioStart() {
    if (!this.audioInitialized) {
      await initMuxAudio();
      // Fetch + decode all room ambient samples up front so room switches are instant
      await preloadAmbient(Object.values(this.rooms).map((r) => r.ambient));
      this.audioInitialized = true;
      this.enterRoom(this.currentRoomId, false); // Trigger initial room ambient after audio unlocks
    }
  }

  enterRoom(roomId, printLog = true) {
    const room = this.rooms[roomId];
    if (!room) return;

    this.currentRoomId = roomId;

    // Remember where the player is so they can resume next visit
    if (this.player && !room.transient && this.player.location !== roomId) {
      this.player = { ...this.player, location: roomId };
      savePlayer(this.player);
    }

    if (printLog) {
      this.appendLog(`\n${this.describeRoom(roomId)}`);
    }

    // Handle Ambient Audio Change
    if (this.audioInitialized) {
      if (room.ambient) {
        playSound(room.ambient);
      } else {
        stopAudio(); // Silence ambient sound if room has none
      }
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    await this.handleAudioStart();

    await this.playerLoaded; // make sure we know who this is before routing them

    const inputEl = this.shadowRoot.getElementById('command');
    const raw = inputEl.value.trim();
    const cmd = raw.toLowerCase();
    inputEl.value = '';

    if (!cmd) return;

    let response = `> ${cmd}`;
    const room = this.rooms[this.currentRoomId];

    if (cmd === 'look') {
      response += `\n${this.describeRoom(this.currentRoomId)}`;
    } else if (room.onInput) {
      await room.onInput(raw);
      return;
    } else if (room.exits[cmd]) {
      // Move to next room (an exit may be a function that picks the destination)
      const exit = room.exits[cmd];
      this.enterRoom(typeof exit === 'function' ? exit() : exit);
      return; // enterRoom handles adding logs for room entry
    } else {
      response += `\nYou can't go or do "${cmd}" here.`;
      playSound('s("sd").room(0.8)'); // Error sound effect
    }

    await this.appendLog(response);
  }

  render() {
    const room = this.rooms[this.currentRoomId];
    return html`
      <div class="terminal" @click="${this.handleAudioStart}">
        <h2>MUD-HOLE [Location: ${room.name}]</h2>
        <div class="output">
          ${this.logs.join('\n\n')}
        </div>
        <form class="input-box" @submit="${this.handleSubmit}">
          <input id="command" type="text" placeholder="Type command (e.g. stairs, look)..." autofocus autocomplete="off" />
          <button type="submit">Action</button>
        </form>
      </div>
    `;
  }
}

customElements.define('mud-game', MudGame);
