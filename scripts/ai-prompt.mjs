// Prints one prompt to paste into a chat AI (ChatGPT, Gemini, Claude.ai...) to make a game:
//   npm run ai-prompt [style] > prompt.txt      (style: phone, pocket, color, advance, console, nextgen, ar, board)
// It joins docs/ai/game-prompt.md, AGENTS.md (the rules and the gs kit) and a starter template. A chat app can't
// open docs/kits, so each line of AGENTS.md's kit index gets what its page says to know (the page's top half).
import { existsSync, readFileSync } from 'node:fs';
const style = process.argv[2] || 'phone';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MARK = '<!-- made below:';
const know = kit => { const p = `docs/kits/${kit}.md`; if (!existsSync(new URL('../' + p, import.meta.url))) return ''; const t = read(p); return t.slice(0, t.indexOf(MARK) < 0 ? t.length : t.indexOf(MARK)).split('\n').slice(3).join(' ').replace(/\s+/g, ' ').trim(); };
const agents = read('AGENTS.md').replace(/^- \[`gs\.(\w+)`\]\(docs\/kits\/\w+\.md\): (.*)$/gm, (_, kit, line) => { const k = know(kit); return `- \`gs.${kit}\`: ${line}${k ? ' ' + k : ''}`; });
process.stdout.write([
  read('docs/ai/game-prompt.md'),
  '---\n\n' + agents,
  `---\n\n## Starter template (${style})\n\n\`\`\`js\n` + read(`scripts/templates/${style}.js`) + '\n```\n',
].join('\n'));
