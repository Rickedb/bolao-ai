const FIFA_API = 'https://api.fifa.com/api/v3';

interface LocalizedStr {
  Locale: string;
  Description: string;
}

interface Player {
  IdPlayer: string;
  PlayerName: LocalizedStr[];
  ShirtNumber: number;
  Captain: boolean;
  Status: number; // 1=starter, 2=bench
  Position: number; // 0=GK, 1=DEF, 2=MID, 3=FWD
}

interface Goal {
  IdPlayer: string;
  Minute: string;
  Type: number;
}

interface Booking {
  IdPlayer: string;
  Minute: string;
  Card: number; // 1=yellow, 2=red
}

interface Substitution {
  IdPlayerOn: string;
  IdPlayerOff: string;
  PlayerOnName: LocalizedStr[];
  PlayerOffName: LocalizedStr[];
  Minute: string;
}

interface TeamData {
  IdTeam: string;
  TeamName: LocalizedStr[];
  Tactics: string;
  Score: number;
  SupportPercentage?: number | null;
  Players: Player[];
  Goals: Goal[];
  Bookings: Booking[];
  Substitutions: Substitution[];
}

interface LiveMatch {
  CompetitionName: LocalizedStr[];
  SeasonName: LocalizedStr[];
  StageName: LocalizedStr[];
  GroupName: LocalizedStr[];
  LocalDate: string;
  Attendance: number;
  Stadium: {
    Name: LocalizedStr[];
    CityName: LocalizedStr[];
    IdCountry: string;
    Roof: boolean;
  };

  HomeTeam: TeamData;
  AwayTeam: TeamData;
  Properties?: { IdIFES?: string };
  Officials: Array<{
    Name: LocalizedStr[];
    OfficialType: number;
    TypeLocalized: LocalizedStr[];
    IdCountry: string;
  }>;
}

interface TimelineEvent {
  Type: number;
}

interface Timeline {
  Event: TimelineEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUrl(url: string): { idCompetition: string; idSeason: string; idStage: string; idMatch: string } {
  const m = url.match(/\/match\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) {
    console.error('URL inválida. Formato esperado: https://www.fifa.com/.../match/{idCompetition}/{idSeason}/{idStage}/{idMatch}');
    process.exit(1);
  }
  return { idCompetition: m[1], idSeason: m[2], idStage: m[3], idMatch: m[4] };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

function loc(arr: LocalizedStr[] | null | undefined): string {
  if (!arr?.length) return '';
  return (arr.find(e => e.Locale.startsWith('pt')) ?? arr[0]).Description;
}

// Parse "9'", "45'+2'" into [minute, added]
function parseMin(min: string | null | undefined): [number, number] {
  const m = (min ?? '').match(/^(\d+)(?:\+(\d+))?/);
  return m ? [parseInt(m[1]), parseInt(m[2] ?? '0')] : [0, 0];
}

function sortByMinute<T extends { Minute: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const [aM, aA] = parseMin(a.Minute);
    const [bM, bA] = parseMin(b.Minute);
    return aM !== bM ? aM - bM : aA - bA;
  });
}

function lookupPlayer(team: TeamData, idPlayer: string): string {
  return loc(team.Players.find(p => p.IdPlayer === idPlayer)?.PlayerName) || idPlayer;
}

// ── FDH Stats ─────────────────────────────────────────────────────────────────

const FDH_API = 'https://fdh-api.fifa.com/v1';

type FdhStat = [string, number, boolean];
type FdhStatMap = Record<string, FdhStat[]>;

interface FdhStats {
  teams: FdhStatMap;
  players: FdhStatMap;
}

function getStat(stats: FdhStat[], name: string): number | null {
  return stats.find(s => s[0] === name)?.[1] ?? null;
}

async function fetchFdhStats(idIFES: string): Promise<FdhStats | null> {
  try {
    const [teams, players] = await Promise.all([
      fetchJson<FdhStatMap>(`${FDH_API}/stats/match/${idIFES}/teams.json`),
      fetchJson<FdhStatMap>(`${FDH_API}/stats/match/${idIFES}/players.json`),
    ]);
    return { teams, players };
  } catch {
    return null;
  }
}

// ── Weather ───────────────────────────────────────────────────────────────────

interface WeatherInfo {
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  description: string;
}

const WMO_CODES: Record<number, string> = {
  0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Neblina', 48: 'Neblina com geada',
  51: 'Garoa fraca', 53: 'Garoa moderada', 55: 'Garoa intensa',
  61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte',
  71: 'Neve fraca', 73: 'Neve moderada', 75: 'Neve forte',
  80: 'Pancadas fracas', 81: 'Pancadas moderadas', 82: 'Pancadas fortes',
  95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada com granizo forte',
};

async function fetchWeather(cityName: string, matchDate: Date): Promise<WeatherInfo | null> {
  try {
    const geoRes = await fetchJson<{ results?: Array<{ latitude: number; longitude: number }> }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pt`,
    );
    const coords = geoRes.results?.[0];
    if (!coords) return null;

    const { latitude, longitude } = coords;
    const dateStr = matchDate.toISOString().slice(0, 10);
    const baseUrl = matchDate < new Date()
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';

    const data = await fetchJson<{
      hourly: {
        temperature_2m: number[];
        relative_humidity_2m: number[];
        wind_speed_10m: number[];
        weather_code: number[];
      };
    }>(`${baseUrl}?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=UTC&wind_speed_unit=kmh`);

    const hour = matchDate.getUTCHours();
    return {
      temperature: data.hourly.temperature_2m[hour] ?? null,
      humidity: data.hourly.relative_humidity_2m[hour] ?? null,
      windSpeed: data.hourly.wind_speed_10m[hour] ?? null,
      description: WMO_CODES[data.hourly.weather_code[hour]] ?? 'N/A',
    };
  } catch {
    return null;
  }
}

// ── Formatter ─────────────────────────────────────────────────────────────────

function formatMatch(live: LiveMatch, timeline: Timeline | null, weather: WeatherInfo | null, fdhStats: FdhStats | null): string {
  const lines: string[] = [];
  const home = live.HomeTeam;
  const away = live.AwayTeam;
  const homeName = loc(home.TeamName);
  const awayName = loc(away.TeamName);

  // Header
  const competition = loc(live.CompetitionName);
  const season = loc(live.SeasonName);
  const stage = loc(live.StageName);
  const group = loc(live.GroupName);
  const date = live.LocalDate
    ? new Date(live.LocalDate).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
    : 'N/A';

  lines.push(`# ${season || competition}`);
  lines.push(`**Fase:** ${stage}${group ? ` — ${group}` : ''}`);
  lines.push(`**Data:** ${date}`);
  lines.push('');

  // Stadium
  const st = live.Stadium;
  lines.push('## Estádio');
  lines.push(`**Nome:** ${loc(st?.Name) || 'N/A'}`);
  lines.push(`**Local:** ${loc(st?.CityName) || 'N/A'}, ${st?.IdCountry || 'N/A'}`);
  lines.push(`**Cobertura:** ${st?.Roof ? 'Coberto' : 'Aberto'}`);
  lines.push('');

  // Weather
  lines.push('## Condições Climáticas');
  if (weather) {
    const temp = weather.temperature != null ? `${weather.temperature}°C` : 'N/A';
    const humidity = weather.humidity != null ? `${weather.humidity}%` : 'N/A';
    const wind = weather.windSpeed != null ? `${weather.windSpeed} km/h` : 'N/A';
    lines.push(`**Clima:** ${weather.description}`);
    lines.push(`**Temperatura:** ${temp} | **Umidade:** ${humidity} | **Vento:** ${wind}`);
  } else {
    lines.push('_Dados climáticos não disponíveis._');
  }
  lines.push('');

  // Score
  lines.push('## Resultado');
  lines.push(`**${homeName} ${home.Score ?? 0} x ${away.Score ?? 0} ${awayName}**`);
  lines.push(`**Público:** ${live.Attendance?.toLocaleString('pt-BR') ?? 'N/A'}`);
  if (home.SupportPercentage != null || away.SupportPercentage != null) {
    const homePct = home.SupportPercentage != null ? `${home.SupportPercentage}%` : 'N/A';
    const awayPct = away.SupportPercentage != null ? `${away.SupportPercentage}%` : 'N/A';
    lines.push(`**Torcida:** ${homeName} ${homePct} | ${awayName} ${awayPct}`);
  }
  lines.push('');

  // Goals
  const allGoals = sortByMinute([
    ...(home.Goals ?? []).map(g => ({ ...g, teamName: homeName, teamData: home })),
    ...(away.Goals ?? []).map(g => ({ ...g, teamName: awayName, teamData: away })),
  ]);

  if (allGoals.length > 0) {
    lines.push('## Gols');
    for (const g of allGoals) {
      const scorer = lookupPlayer(g.teamData, g.IdPlayer);
      lines.push(`- ${g.Minute} **${scorer}** (${g.teamName})`);
    }
    lines.push('');
  }

  // Lineups
  const posLabel = ['GK', 'ZAG', 'MEI', 'ATA'];

  lines.push('## Escalações');
  for (const team of [home, away]) {
    const name = loc(team.TeamName);
    lines.push(`### ${name} (${team.Tactics ?? '?'})`);

    const starters = (team.Players ?? [])
      .filter(p => p.Status === 1)
      .sort((a, b) => a.Position - b.Position || (a.ShirtNumber ?? 99) - (b.ShirtNumber ?? 99));
    const bench = (team.Players ?? [])
      .filter(p => p.Status === 2)
      .sort((a, b) => (a.ShirtNumber ?? 99) - (b.ShirtNumber ?? 99));

    lines.push('**Titulares:**');
    for (const p of starters) {
      const cap = p.Captain ? ' (C)' : '';
      const pos = posLabel[p.Position] ?? '?';
      lines.push(`  ${p.ShirtNumber}. ${loc(p.PlayerName)} [${pos}]${cap}`);
    }

    if (bench.length > 0) {
      lines.push('**Banco:**');
      for (const p of bench) {
        lines.push(`  ${p.ShirtNumber}. ${loc(p.PlayerName)}`);
      }
    }
    lines.push('');
  }

  // Cards
  const allBookings = sortByMinute([
    ...(home.Bookings ?? []).map(b => ({ ...b, teamName: homeName, teamData: home })),
    ...(away.Bookings ?? []).map(b => ({ ...b, teamName: awayName, teamData: away })),
  ]);

  if (allBookings.length > 0) {
    lines.push('## Cartões');
    for (const b of allBookings) {
      const name = lookupPlayer(b.teamData, b.IdPlayer);
      const card = b.Card === 2 ? '🔴 Vermelho' : '🟡 Amarelo';
      lines.push(`- ${b.Minute} **${name}** (${b.teamName}) — ${card}`);
    }
    lines.push('');
  }

  // Substitutions
  const hasSubs = (t: TeamData) => (t.Substitutions ?? []).length > 0;
  if (hasSubs(home) || hasSubs(away)) {
    lines.push('## Substituições');
    for (const team of [home, away]) {
      const subs = sortByMinute(team.Substitutions ?? []);
      if (!subs.length) continue;
      lines.push(`**${loc(team.TeamName)}:**`);
      for (const sub of subs) {
        const off = loc(sub.PlayerOffName);
        const on = loc(sub.PlayerOnName);
        lines.push(`  - ${sub.Minute}: ${off} → ${on}`);
      }
    }
    lines.push('');
  }

  // Referees
  if (live.Officials?.length > 0) {
    lines.push('## Árbitros');
    for (const r of live.Officials) {
      const role = loc(r.TypeLocalized);
      const country = r.IdCountry ? ` (${r.IdCountry})` : '';
      lines.push(`- **${loc(r.Name)}**${country} — ${role}`);
    }
    lines.push('');
  }

  // Match stats
  if (fdhStats) {
    const hs = fdhStats.teams[home.IdTeam] ?? [];
    const as_ = fdhStats.teams[away.IdTeam] ?? [];

    const header = () => {
      lines.push(`| Estatística | ${homeName} | ${awayName} |`);
      lines.push('|-------------|:-----------:|:-----------:|');
    };
    const row = (label: string, hVal: number | null, aVal: number | null, fmt?: (v: number) => string) => {
      const f = fmt ?? ((v: number) => String(v));
      lines.push(`| ${label} | ${hVal != null ? f(hVal) : 'N/A'} | ${aVal != null ? f(aVal) : 'N/A'} |`);
    };
    const h = (name: string) => getStat(hs, name);
    const a = (name: string) => getStat(as_, name);
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    const km = (v: number) => `${(v / 1000).toFixed(2)} km`;
    const dec2 = (v: number) => v.toFixed(2);

    lines.push('## Estatísticas da Partida');
    lines.push('');

    lines.push('**Ataque**');
    header();
    row('Posse de bola', h('Possession'), a('Possession'), pct);
    row('xG (gols esperados)', h('XG'), a('XG'), dec2);
    lines.push('');

    lines.push('**Gol**');
    header();
    row('Total', h('Goals'), a('Goals'));
    row('Sofridos', h('GoalsConceded'), a('GoalsConceded'));
    row('Dentro da grande área', h('GoalsInsideThePenaltyArea'), a('GoalsInsideThePenaltyArea'));
    row('Fora da área', h('GoalsOutsideThePenaltyArea'), a('GoalsOutsideThePenaltyArea'));
    row('Assistências', h('Assists'), a('Assists'));
    lines.push('');

    lines.push('**Chutes**');
    header();
    row('Total', h('AttemptAtGoal'), a('AttemptAtGoal'));
    row('No gol', h('AttemptAtGoalOnTarget'), a('AttemptAtGoalOnTarget'));
    row('Para fora', h('AttemptAtGoalOffTarget'), a('AttemptAtGoalOffTarget'));
    row('Bloqueados', h('AttemptAtGoalBlocked'), a('AttemptAtGoalBlocked'));
    row('Dentro da grande área', h('AttemptAtGoalInsideThePenaltyArea'), a('AttemptAtGoalInsideThePenaltyArea'));
    row('Fora da área', h('AttemptAtGoalOutsideThePenaltyArea'), a('AttemptAtGoalOutsideThePenaltyArea'));
    lines.push('');

    lines.push('**Penetrações nas proximidades da área adversária**');
    header();
    row('Corredor esquerdo', h('FinalThirdEntriesReceptionLeftChannel'), a('FinalThirdEntriesReceptionLeftChannel'));
    row('Corredor esquerdo interior', h('FinalThirdEntriesReceptionInsideLeftChannel'), a('FinalThirdEntriesReceptionInsideLeftChannel'));
    row('Corredor central', h('FinalThirdEntriesReceptionCentralChannel'), a('FinalThirdEntriesReceptionCentralChannel'));
    row('Corredor direito interior', h('FinalThirdEntriesReceptionInsideRightChannel'), a('FinalThirdEntriesReceptionInsideRightChannel'));
    row('Corredor direito', h('FinalThirdEntriesReceptionRightChannel'), a('FinalThirdEntriesReceptionRightChannel'));
    lines.push('');

    lines.push('**Pedidos de bola**');
    header();
    row('Total', h('OffersToReceiveTotal'), a('OffersToReceiveTotal'));
    row('Atrás', h('OffersToReceiveInBehind'), a('OffersToReceiveInBehind'));
    row('Por entre', h('OffersToReceiveInBetween'), a('OffersToReceiveInBetween'));
    row('Na frente', h('OffersToReceiveInFront'), a('OffersToReceiveInFront'));
    lines.push('');

    lines.push('**Recepções**');
    header();
    row('Entre as linhas def. e meia', h('ReceptionsBetweenMidfieldAndDefensiveLine'), a('ReceptionsBetweenMidfieldAndDefensiveLine'));
    row('Atrás da linha defensiva', h('ReceptionsInBehind'), a('ReceptionsInBehind'));
    lines.push('');

    lines.push('**Penetrações**');
    header();
    row('Tentativas', h('LinebreaksAttempted'), a('LinebreaksAttempted'));
    row('Concluídas', h('LinebreaksAttemptedCompleted'), a('LinebreaksAttemptedCompleted'));
    row('Tentativas na defesa', h('LinebreaksAttemptedDefensiveLine'), a('LinebreaksAttemptedDefensiveLine'));
    row('Concluídas na defesa', h('LinebreaksAttemptedDefensiveLineCompleted'), a('LinebreaksAttemptedDefensiveLineCompleted'));
    lines.push('');

    lines.push('**Distribuição de jogo**');
    header();
    row('Passes', h('Passes'), a('Passes'));
    row('Passes concluídos', h('PassesCompleted'), a('PassesCompleted'));
    row('Cruzamentos', h('Crosses'), a('Crosses'));
    row('Cruzamentos concluídos', h('CrossesCompleted'), a('CrossesCompleted'));
    row('Alternâncias de jogo realizadas', h('CompletedSwitchesOfPlay'), a('CompletedSwitchesOfPlay'));
    lines.push('');

    lines.push('**Jogadas de bola parada**');
    header();
    row('Cantos', h('Corners'), a('Corners'));
    row('Livres', h('FreeKicks'), a('FreeKicks'));
    row('Pênaltis convertidos', h('PenaltiesScored'), a('PenaltiesScored'));
    lines.push('');

    lines.push('**Defesa**');
    header();
    row('Gols contra', h('OwnGoals'), a('OwnGoals'));
    row('Erros forçados', h('ForcedTurnovers'), a('ForcedTurnovers'));
    row('Pressões defensivas exercidas', h('DefensivePressuresApplied'), a('DefensivePressuresApplied'));
    row('Defesas do goleiro', h('GoalkeeperSaves'), a('GoalkeeperSaves'));
    lines.push('');

    lines.push('**Disciplina**');
    header();
    row('Cartões amarelos', h('YellowCards'), a('YellowCards'));
    row('Cartões vermelhos', h('RedCards'), a('RedCards'));
    row('Faltas recebidas', h('FoulsAgainst'), a('FoulsAgainst'));
    row('Impedimentos', h('Offsides'), a('Offsides'));
    lines.push('');

    lines.push('**Físico**');
    header();
    row('Distância total', h('TotalDistance'), a('TotalDistance'), km);
    row('Sprints de alta velocidade', h('DistanceHighSpeedSprinting'), a('DistanceHighSpeedSprinting'), km);
    row('Velocidade média (km/h)', h('AvgSpeed'), a('AvgSpeed'), dec2);
    row('Velocidade máxima (km/h)', h('TopSpeed'), a('TopSpeed'), dec2);
    lines.push('');

    // Player stats — starters only
    const homeSet = new Set((home.Players ?? []).map(p => p.IdPlayer));
    const allPlayers = [...(home.Players ?? []), ...(away.Players ?? [])].filter(p => p.Status === 1);
    const playerRows: string[] = [];
    for (const p of allPlayers) {
      const ps = fdhStats.players[p.IdPlayer];
      if (!ps) continue;
      const goals = getStat(ps, 'Goals') ?? 0;
      const assists = getStat(ps, 'Assists') ?? 0;
      const shots = getStat(ps, 'AttemptAtGoal') ?? 0;
      const passes = getStat(ps, 'Passes') ?? 0;
      const passComp = getStat(ps, 'PassesCompleted') ?? 0;
      const totalDist = getStat(ps, 'TotalDistance');
      const distStr = totalDist != null ? `${(totalDist / 1000).toFixed(2)} km` : 'N/A';
      const avgSpeed = getStat(ps, 'AvgSpeed');
      const speedStr = avgSpeed != null ? `${avgSpeed.toFixed(2)} km/h` : 'N/A';
      const teamName = homeSet.has(p.IdPlayer) ? homeName : awayName;
      const passPct = passes > 0 ? ` (${((passComp / passes) * 100).toFixed(0)}%)` : '';
      playerRows.push(`| ${loc(p.PlayerName)} | ${teamName} | ${goals} | ${assists} | ${shots} | ${passes}${passPct} | ${distStr} | ${speedStr} |`);
    }
    if (playerRows.length > 0) {
      lines.push('## Estatísticas dos Jogadores');
      lines.push('| Jogador | Equipe | Gols | Assist | Chutes | Passes | Distância | Vel. média |');
      lines.push('|---------|--------|:----:|:------:|:------:|--------|----------:|-----------:|');
      lines.push(...playerRows);
      lines.push('');
    }
  } else if (timeline?.Event?.length) {
    // Fallback to timeline counts when fdh-api is unavailable
    const ev = timeline.Event;
    const count = (type: number) => ev.filter(e => e.Type === type).length;
    lines.push('## Estatísticas da Partida');
    lines.push('| Evento | Total |');
    lines.push('|--------|-------|');
    lines.push(`| Finalizações | ${count(12)} |`);
    lines.push(`| Escanteios | ${count(16)} |`);
    lines.push(`| Faltas | ${count(18)} |`);
    lines.push(`| Impedimentos | ${count(15)} |`);
    if (count(71) > 0) lines.push(`| Revisões VAR | ${count(71)} |`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: npx tsx src/extract-match.ts <url-da-partida-fifa>');
    console.error('Exemplo: npx tsx src/extract-match.ts "https://www.fifa.com/pt/match-centre/match/17/285023/289273/400021443"');
    process.exit(1);
  }

  const { idCompetition, idSeason, idStage, idMatch } = parseUrl(url);
  const path = `${idCompetition}/${idSeason}/${idStage}/${idMatch}`;

  const [live, timeline] = await Promise.all([
    fetchJson<LiveMatch>(`${FIFA_API}/live/football/${path}?language=pt`),
    fetchJson<Timeline>(`${FIFA_API}/timelines/${path}?language=pt`).catch(() => null),
  ]);

  const idIFES = live.Properties?.IdIFES ?? null;
  const matchDate = live.LocalDate ? new Date(live.LocalDate) : null;
  const cityName = loc(live.Stadium?.CityName);

  const [weather, fdhStats] = await Promise.all([
    matchDate && cityName ? fetchWeather(cityName, matchDate) : Promise.resolve(null),
    idIFES ? fetchFdhStats(idIFES) : Promise.resolve(null),
  ]);

  const content = formatMatch(live, timeline, weather, fdhStats);

  const slugify = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

  const dt = live.LocalDate
    ? new Date(live.LocalDate).toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 16)
    : 'unknown';
  const home = slugify(loc(live.HomeTeam.TeamName));
  const away = slugify(loc(live.AwayTeam.TeamName));
  const fileName = `${idMatch}-${dt}-${home}_x_${away}.md`;

  const fs = await import('fs/promises');
  await fs.mkdir('output', { recursive: true });
  const outFile = `output/${fileName}`;
  await fs.writeFile(outFile, content, 'utf-8');
  console.log(`Salvo em ${outFile}`);
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
