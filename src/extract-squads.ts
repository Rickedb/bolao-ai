const FIFA_API = 'https://api.fifa.com/api/v3';
const CXM_BASE = 'https://cxm-api.fifa.com/fifaplusweb/api/pages/pt/tournaments/mens/worldcup/canadamexicousa2026/teams';
const FANTASY_URL = 'https://play.fifa.com/json/fantasy/squads.json';
const ID_COMPETITION = '17';
const ID_SEASON = '285023';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FantasyTeam {
  id: number;
  name: string;
  group: string;
  abbr: string;
  isEliminated: boolean;
}

interface LocalizedStr {
  Locale: string;
  Description: string;
}

interface V3Player {
  IdPlayer: string;
  PlayerName: LocalizedStr[];
  ShortName: LocalizedStr[];
  JerseyNum: number;
  Position: number;
  BirthDate: string | null;
  Height: number | null;
  Weight: number | null;
  IdCountry: string;
  Goals: number | null;
  YellowCards: number | null;
  RedCards: number | null;
  PlayerPicture: { PictureUrl: string } | null;
}

interface V3Squad {
  IdTeam: string;
  TeamName: LocalizedStr[];
  Players: V3Player[];
}

interface CxmPage {
  teamId: string;
  seasonId: string;
}

interface Player {
  id: string;
  name: string;
  shortName: string;
  jersey: number;
  position: string;
  birthDate: string;
  height: number | null;
  weight: number | null;
  nationality: string;
  pictureUrl: string | null;
}

interface TeamSquad {
  name: string;
  abbr: string;
  group: string;
  teamId: string;
  players: Player[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Country names where auto-slugification doesn't match FIFA's URL
const SLUG_OVERRIDES: Record<string, string> = {
  'Bosnia and Herzegovina': 'bosnia-herzegovina',
};

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/'/g, ' ')              // apostrophe → space (e.g. "d'Ivoire" → "d ivoire")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function loc(arr: LocalizedStr[] | null | undefined): string {
  if (!arr?.length) return '';
  return (arr.find(e => e.Locale.startsWith('pt')) ?? arr[0]).Description;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function resolveTeamId(countryName: string): Promise<string> {
  const slug = SLUG_OVERRIDES[countryName] ?? toSlug(countryName);
  const page = await fetchJson<CxmPage>(`${CXM_BASE}/${slug}/squad`);
  return page.teamId;
}

async function fetchSquadPlayers(teamId: string): Promise<V3Player[]> {
  const data = await fetchJson<V3Squad>(
    `${FIFA_API}/teams/${teamId}/squad?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&language=pt`,
  );
  return data.Players ?? [];
}

async function processTeam(team: FantasyTeam): Promise<TeamSquad | null> {
  try {
    const teamId = await resolveTeamId(team.name);
    const v3Players = await fetchSquadPlayers(teamId);

    const players: Player[] = v3Players
      .map(p => ({
        id: p.IdPlayer,
        name: loc(p.PlayerName),
        shortName: loc(p.ShortName) || loc(p.PlayerName),
        jersey: p.JerseyNum,
        position: POSITIONS[p.Position] ?? 'N/A',
        birthDate: p.BirthDate?.slice(0, 10) ?? '',
        height: p.Height,
        weight: p.Weight,
        nationality: p.IdCountry,
        pictureUrl: p.PlayerPicture?.PictureUrl ?? null,
      }))
      .sort((a, b) => a.jersey - b.jersey);

    process.stdout.write(`  ✓ ${team.name} (${players.length} jogadores)\n`);
    return { name: team.name, abbr: team.abbr, group: team.group.toUpperCase(), teamId, players };
  } catch (err) {
    process.stderr.write(`  ✗ ${team.name}: ${(err as Error).message}\n`);
    return null;
  }
}

// ── Formatter ─────────────────────────────────────────────────────────────────

function formatSquads(squads: TeamSquad[]): string {
  const lines: string[] = [];
  lines.push('# Elencos — Copa do Mundo FIFA 2026™');
  lines.push('');

  const byGroup = new Map<string, TeamSquad[]>();
  for (const s of squads) {
    (byGroup.get(s.group) ?? byGroup.set(s.group, []).get(s.group)!).push(s);
  }

  for (const [group, teams] of [...byGroup.entries()].sort()) {
    lines.push(`## Grupo ${group}`);
    lines.push('');
    for (const team of teams) {
      lines.push(`### ${team.name} (${team.abbr})`);
      lines.push('');
      lines.push('| # | Nome | Pos | Nascimento | Alt. | Peso |');
      lines.push('|---|------|-----|------------|-----:|-----:|');
      for (const p of team.players) {
        const h = p.height != null ? `${p.height} cm` : '—';
        const w = p.weight != null ? `${p.weight} kg` : '—';
        lines.push(`| ${p.jersey} | ${p.name} | ${p.position} | ${p.birthDate} | ${h} | ${w} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Buscando lista de seleções...');
  const teams = await fetchJson<FantasyTeam[]>(FANTASY_URL);
  console.log(`${teams.length} seleções encontradas.\n`);

  console.log('Buscando elencos (concorrência: 5)...');
  const results = await runWithConcurrency(teams, 5, processTeam);
  const squads = results.filter((s): s is TeamSquad => s !== null);

  squads.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  const totalPlayers = squads.reduce((n, s) => n + s.players.length, 0);

  const fs = await import('fs/promises');
  await fs.mkdir('output', { recursive: true });

  const content = formatSquads(squads);
  const outFile = 'output/squads.md';
  await fs.writeFile(outFile, content, 'utf-8');

  console.log(`\nSalvo em ${outFile}`);
  console.log(`Total: ${squads.length} seleções, ${totalPlayers} jogadores`);
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
