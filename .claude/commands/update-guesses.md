# Skill: update-guesses

Update the README.md "Histórico de Palpites" table with real match results extracted from the round files.

## Steps

1. Run `run-extract-from-file.sh` with `links.txt` as argument to extract recent games.

2. Read `README.md` to find all rows in the "Histórico de Palpites" table.

3. Identify rows that contain `*(aguardando)*` — these are games still awaiting real results.

4. Read **all files** in `output/rounds/` (e.g. `primeira-fase.md`, `segundas-de-final.md`, and any others present) to extract real match results. Use `ls output/rounds/` first to discover all files, then read each one. Each game section contains a `## Resultado` line in the format:
   ```
   **Team A N x M Team B**
   ```
   Match this to the game in README.md by team names (be flexible with diacritics / alternate names).

5. For each awaiting game where a real result is now available, compute:
   - **Acerto Resultado**: ✅ if the predicted winner/draw matches the real winner/draw; ❌ otherwise.
   - **Gols Casa**: ✅ (N) if the predicted home goals equal the real home goals; ❌ (real≠predicted) otherwise.
   - **Gols Fora**: ✅ (N) if the predicted away goals equal the real away goals; ❌ (real≠predicted) otherwise.
   - **Placar Exato**: ✅ if BOTH home and away goals were predicted exactly; ❌ otherwise.

   The "home" team in each row is the first team listed in the "Jogo" column.
   The bet format is `"[Team] GolsA x GolsB"` where the listed team is the predicted winner (or it's the home team if a draw is predicted with no winner prefix).

   **Parsing the bet**: The bet column contains something like `"México 2 x 1"` or `"Escócia 2 x 0"`. To find the predicted home and away goals:
   - The team name at the start of the bet is the PREDICTED WINNER (or home team for draws).
   - The first number is the predicted goals for that team; the second is for the opposing team.
   - If the predicted winner is the HOME team (first in Jogo), then predicted home goals = first number, away goals = second.
   - If the predicted winner is the AWAY team, then predicted home goals = second number, away goals = first.
   - For draws, the home team is listed with equal goals.

6. Update the README.md table rows: replace `*(aguardando)*` and the `—` placeholders with actual values.

7. Recalculate the **Estatísticas** table at the bottom of README.md:
   - Count completed games (rows without `*(aguardando)*` after the update).
   - **Acerto de Resultado**: count of ✅ in that column / total completed games.
   - **Acerto de Gols**: count of ✅ across BOTH Gols Casa and Gols Fora columns / (total completed games × 2).
   - **Placar Exato**: count of ✅ in Placar Exato column / total completed games.
   - Format percentages as integers (e.g. `52%`).

8. Write the updated README.md.

## Notes

- Do NOT change rows that already have a real result (not `*(aguardando)*`).
- If a game from the README is not yet found in any round file, leave it as `*(aguardando)*`.
- Team name matching should be fuzzy: `Bósnia e Herzegovina` ↔ `Bósnia`, `Qatar` ↔ `Catar`, `RD Congo` ↔ `RD do Congo`, etc.
- The real result format in README uses `**Home N x M Away**` only when home team wins/draws with home team first. If the away team wins, it may appear as `**Home N x M Away**` with the away goals higher. Always keep the home-first order in the result column.
