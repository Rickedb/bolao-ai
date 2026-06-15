import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const OUTPUT_DIR = 'output';
const ROUNDS_DIR = path.join(OUTPUT_DIR, 'rounds');
const FRIENDLIES_DIR = path.join(OUTPUT_DIR, 'friendlies');

// ── Confederation map (NFD-normalized lowercase → confederation) ───────────────

const CONFEDERATION_MAP: Record<string, string> = {
  // UEFA
  'suica': 'uefa', 'escocia': 'uefa', 'tchequia': 'uefa',
  'bosnia e herzegovina': 'uefa', 'turquia': 'uefa', 'alemanha': 'uefa',
  'holanda': 'uefa', 'suecia': 'uefa', 'belgica': 'uefa', 'espanha': 'uefa',
  'franca': 'uefa', 'noruega': 'uefa', 'austria': 'uefa', 'portugal': 'uefa',
  'croacia': 'uefa', 'inglaterra': 'uefa', 'italia': 'uefa', 'irlanda': 'uefa',
  'ucrania': 'uefa', 'serbia': 'uefa', 'hungria': 'uefa', 'eslovenia': 'uefa',
  'romenia': 'uefa', 'albania': 'uefa', 'georgia': 'uefa', 'eslovaquia': 'uefa',
  'dinamarca': 'uefa', 'finlandia': 'uefa', 'pais de gales': 'uefa',
  'polonia': 'uefa', 'grecia': 'uefa', 'gales': 'uefa',

  // CONMEBOL
  'brasil': 'conmebol', 'paraguai': 'conmebol', 'equador': 'conmebol',
  'uruguai': 'conmebol', 'argentina': 'conmebol', 'colombia': 'conmebol',
  'venezuela': 'conmebol', 'bolivia': 'conmebol', 'chile': 'conmebol',
  'peru': 'conmebol',

  // CONCACAF
  'mexico': 'concacaf', 'canada': 'concacaf', 'eua': 'concacaf',
  'haiti': 'concacaf', 'curacao': 'concacaf', 'curacau': 'concacaf',
  'panama': 'concacaf', 'jamaica': 'concacaf', 'honduras': 'concacaf',
  'el salvador': 'concacaf', 'costa rica': 'concacaf',
  'trinidad e tobago': 'concacaf', 'guatemala': 'concacaf',
  'suriname': 'concacaf', 'nicaragua': 'concacaf',

  // CAF
  'africa do sul': 'caf', 'marrocos': 'caf', 'costa do marfim': 'caf',
  'tunisia': 'caf', 'egito': 'caf', 'cabo verde': 'caf', 'senegal': 'caf',
  'rep. dem. do congo': 'caf', 'republica democratica do congo': 'caf',
  'gana': 'caf', 'argelia': 'caf', 'nigeria': 'caf', 'camaroes': 'caf',
  'mali': 'caf', 'mocambique': 'caf', 'tanzania': 'caf', 'congo': 'caf',
  'guine': 'caf', 'guine-bissau': 'caf', 'burkina faso': 'caf',
  'benin': 'caf', 'zambia': 'caf', 'uganda': 'caf', 'quenia': 'caf',
  'zimbabue': 'caf', 'namibia': 'caf', 'angola': 'caf', 'liberia': 'caf',
  'ruanda': 'caf', 'etiopia': 'caf',

  // AFC (includes OFC/Nova Zelândia)
  'coreia do sul': 'afc', 'republica da coreia': 'afc',
  'qatar': 'afc', 'catar': 'afc', 'australia': 'afc', 'japao': 'afc',
  'ira': 'afc', 'arabia saudita': 'afc', 'iraque': 'afc',
  'jordania': 'afc', 'uzbequistao': 'afc', 'indonesia': 'afc',
  'bahrain': 'afc', 'oma': 'afc', 'emirados arabes unidos': 'afc',
  'emirados arabes': 'afc', 'china': 'afc', 'india': 'afc',
  'tajiquistao': 'afc', 'taijiquistao': 'afc', 'quirguistao': 'afc',
  'siria': 'afc', 'vietnam': 'afc', 'tailandia': 'afc',
  'nova zelandia': 'afc', // OFC grouped with AFC
};

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function confederation(teamName: string): string {
  return CONFEDERATION_MAP[normalize(teamName)] ?? 'unknown';
}

// ── File model ────────────────────────────────────────────────────────────────

interface MatchFile {
  id: string;
  date: string;
  isFriendly: boolean;
  filePath: string;
  content: string;
}

export function isFriendlyId(id: string): boolean {
  return /[a-zA-Z]/.test(id);
}

async function loadMatchFiles(): Promise<MatchFile[]> {
  const files = await readdir(OUTPUT_DIR);
  const results: MatchFile[] = [];

  for (const f of files) {
    const m = f.match(/^([a-zA-Z0-9]+)-(\d{4}-\d{2}-\d{2})_.+\.md$/);
    if (!m || f === 'squads.md') continue;

    const filePath = path.join(OUTPUT_DIR, f);
    const content = await readFile(filePath, 'utf-8');
    results.push({ id: m[1], date: m[2], isFriendly: isFriendlyId(m[1]), filePath, content });
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

function extractTeamNames(content: string): [string, string] | null {
  const m = content.match(/## Resultado\n\*\*(.+?) \d+ x \d+ (.+?)\*\*/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

// ── Build rounds ──────────────────────────────────────────────────────────────

export async function buildRound(roundNumber: number, fromDate: string, toDate: string): Promise<void> {
  const all = await loadMatchFiles();
  const matches = all
    .filter(f => !f.isFriendly && f.date >= fromDate && f.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (matches.length === 0) {
    console.log(`Nenhum jogo oficial encontrado entre ${fromDate} e ${toDate}`);
    return;
  }

  await mkdir(ROUNDS_DIR, { recursive: true });
  const body = matches.map(m => m.content).join('\n\n---\n\n');
  const outFile = path.join(ROUNDS_DIR, `rodada-${roundNumber}.md`);
  await writeFile(outFile, body, 'utf-8');
  console.log(`Salvo: ${outFile} (${matches.length} jogos)`);
}

// ── Append to stage ───────────────────────────────────────────────────────────

function stageSlug(stageName: string): string {
  return stageName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export async function appendToStage(stageName: string, idMatch: string, matchContent: string): Promise<void> {
  if (!stageName) {
    console.warn('appendToStage: nome da fase vazio, ignorando');
    return;
  }
  await mkdir(ROUNDS_DIR, { recursive: true });
  const outFile = path.join(ROUNDS_DIR, `${stageSlug(stageName)}.md`);
  let existing = '';
  try { existing = await readFile(outFile, 'utf-8'); } catch { /* new file */ }
  if (existing.includes(idMatch)) {
    console.log(`  Fase já contém ${idMatch} — ignorando`);
    return;
  }
  const body = existing ? `${existing.trimEnd()}\n\n---\n\n${matchContent}` : matchContent;
  await writeFile(outFile, body, 'utf-8');
  console.log(`  Fase "${stageName}" → ${outFile}`);
}

// ── Build friendlies ──────────────────────────────────────────────────────────

export async function buildFriendlies(): Promise<void> {
  const all = await loadMatchFiles();
  const friendlies = all.filter(f => f.isFriendly);

  const byConf: Record<string, MatchFile[]> = {};

  for (const match of friendlies) {
    const teams = extractTeamNames(match.content);
    if (!teams) {
      console.warn(`Não foi possível extrair times de: ${path.basename(match.filePath)}`);
      continue;
    }

    const confs = new Set([confederation(teams[0]), confederation(teams[1])]);
    for (const conf of confs) {
      if (!byConf[conf]) byConf[conf] = [];
      byConf[conf].push(match);
    }

    if (confs.has('unknown')) {
      const unknown = [teams[0], teams[1]].filter(t => confederation(t) === 'unknown');
      console.warn(`Confederação desconhecida para: ${unknown.join(', ')}`);
    }
  }

  await mkdir(FRIENDLIES_DIR, { recursive: true });

  for (const [conf, matches] of Object.entries(byConf)) {
    // Deduplicate (match between 2 same-conf teams appears only once)
    const seen = new Set<string>();
    const unique = matches
      .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first

    const body = unique.map(m => m.content).join('\n\n---\n\n');
    const outFile = path.join(FRIENDLIES_DIR, `amistosos-${conf}.md`);
    await writeFile(outFile, body, 'utf-8');
    console.log(`Salvo: ${outFile} (${unique.length} jogos)`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--round') {
    const roundNumber = parseInt(args[1]);
    const fromIdx = args.indexOf('--from');
    const toIdx = args.indexOf('--to');
    if (!roundNumber || fromIdx === -1 || toIdx === -1) {
      console.error('Uso: npx tsx src/build-context.ts --round N --from YYYY-MM-DD --to YYYY-MM-DD');
      process.exit(1);
    }
    await buildRound(roundNumber, args[fromIdx + 1], args[toIdx + 1]);
  } else if (args[0] === '--friendlies') {
    await buildFriendlies();
  } else {
    console.error('Uso:');
    console.error('  npx tsx src/build-context.ts --round N --from YYYY-MM-DD --to YYYY-MM-DD');
    console.error('  npx tsx src/build-context.ts --friendlies');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
