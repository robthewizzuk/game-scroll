# Making games with AI tools

You can make a Game Scroll game with Claude, ChatGPT (GPT), Gemini, Copilot or any other AI
helper. The repo carries instructions those tools read, so they know the rules, the `gs` kit and
the checks to run.

## Coding tools that work in the repo

Open the repo in the tool and ask, for example: *"Make a new Pocket game where you herd sheep with
a dog by tilting the phone."*

| Tool | Reads | Extra |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` (which loads `AGENTS.md`) | the `make-game` skill: type `/make-game` or just ask for a game |
| OpenAI Codex, Cursor, Jules, and most others | `AGENTS.md` | |
| Gemini CLI | `GEMINI.md` (which loads `AGENTS.md`) | |
| GitHub Copilot | `.github/copilot-instructions.md` | |

These tools can run the checks themselves and fix what fails: `node scripts/check.mjs <id>` runs them all and
prints one report with the line and a fix for each problem, the speed report included (frame time left, the slowest
lines, garbage, and for 3D games draw calls, triangles and shaders built mid-play against phone budgets; `npm run speed <id>`
alone). `node scripts/examples.mjs <name>` shows them how
real games use any part of `gs`. Ask them to.

## The Game Scroll MCP server

The repo has its own [MCP](https://modelcontextprotocol.io) server, `scripts/mcp.mjs`, so an AI tool can ask the
engine instead of guessing. Its tools:

| Tool | What it gives back |
| --- | --- |
| `kit_guide` | a part of `gs` explained (docs/kits): what to know, its types, examples, the shortest real games using it; no name: the index |
| `find_examples` | how real games use a part (`Physics.rope`, `Feel.coin`), shortest first, with the lines |
| `feel_words` | which knob a word like *floaty*, *snappy* or *unfair* moves |
| `new_game` | a new game from a style's template |
| `check_game` | every check in one report: each problem's line, code and fix (`quick` for the code checks alone) |
| `knobs` | a game's feel numbers with ranges; `set` changes them in the file |
| `play_and_watch` | plays it with taps and returns a strip of frames and numbers (score over time, rounds, frame times, errors); with knob `changes`, before and after from the same start and taps |
| `speed_report` | frame time left, slowest lines, garbage, memory; 3D draws, triangles, shaders mid-play against phones |
| `frame_lab_advice` | what to change from a phone's frame lab summary or report |

So "make the jump floatier" becomes: `feel_words` (floaty: gravity down, jump time up), `knobs` (the game's
`gravity`), `play_and_watch` with `gravity*0.8` to see before and after, then `knobs` with `set` to keep it.

Setting it up (it runs `node scripts/mcp.mjs` in the repo; no packages to install):

- **Claude Code**: `.mcp.json` in the repo sets it up; Claude Code asks once to allow it.
- **Cursor**: Settings › MCP › Add, or `.cursor/mcp.json`: `{ "mcpServers": { "game-scroll": { "command": "node", "args": ["scripts/mcp.mjs"] } } }`.
- **Codex CLI**: in `~/.codex/config.toml`: `[mcp_servers.game-scroll]` with `command = "node"` and `args = ["scripts/mcp.mjs"]` (start Codex in the repo).
- **Gemini CLI**: in `.gemini/settings.json`: `{ "mcpServers": { "game-scroll": { "command": "node", "args": ["scripts/mcp.mjs"] } } }`.
- **VS Code (Copilot agent mode)**: `.vscode/mcp.json`: `{ "servers": { "game-scroll": { "command": "node", "args": ["scripts/mcp.mjs"] } } }`.

Without MCP, the same tools are commands: `npm run kit <name>`, `node scripts/examples.mjs <name>`, `npm run check <id>`,
`npm run knobs <id>`, `npm run watch <id> [knob changes]`, `npm run speed <id>`, `node scripts/budget.cjs --lab <file>`.

## Chat apps (ChatGPT, Gemini, Claude.ai)

1. Run `npm run ai-prompt pocket > prompt.txt` (or `phone`, `color`, `advance`, `console`, `nextgen`, `ar`, `board`).
   It joins the request (`docs/ai/game-prompt.md`), the rules and kit (`AGENTS.md`) and a starter template.
2. Open `prompt.txt`, describe your idea where it says so, and paste the whole thing into the chat.
3. Save the code it gives you as `src/games/<id>.js` and run the checks:
   ```bash
   npm run check <id>
   ```
4. Paste the report back into the chat and ask it to fix what failed: each problem names the line, shows
   the code on it and says what to do. Then play it with `npm run dev`.

## Tips

- Ask for a mechanic that plays differently from the games already in the feed. A reskin won't be merged.
- Ask for original names and characters. AI tools sometimes copy famous games: check, and ask again if so.
- Ask it to use `gs.effects.Feel` for game feel and `gs.physics`, `gs.ai`, `gs.pixel` instead of
  writing its own versions. Games come out shorter and feel better.
- Play it on a real phone before opening the PR: thumbs are bigger than mouse pointers.
- You're responsible for what you submit. Read the code, and keep the rules in [CONTRIBUTING.md](../CONTRIBUTING.md).
