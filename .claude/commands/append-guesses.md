# Skill: append-guesses

Append new bet rows to the README.md "Histórico de Palpites" table for upcoming games that are not yet listed there.

## Usage

The user will provide a list of guesses in natural language, like:
- "Suíça 1 x 0 Canadá, Coreia do Sul 2 x 1 México"
- or structured as "Jogo: Palpite" pairs

The $ARGUMENTS variable contains the guesses provided by the user when invoking the command.

## Steps

1. Read `README.md` to get the current list of games already in the "Histórico de Palpites" table (both completed and awaiting).

2. Parse the guesses from `$ARGUMENTS`. Each guess specifies a match and a predicted score. Accepted formats:
   - `"Time A N x M Time B"` — Time A is the predicted winner (or either team for a draw)
   - `"Time A N x M"` — shorthand when context makes the opponent clear
   - Multiple guesses separated by commas, semicolons, or newlines

3. For each parsed guess:
   - Determine the **Jogo** name (home x away) by checking which team is home based on the schedule or context. If ambiguous, use the order the user provided.
   - Determine the **Palpite** format: `"[PredictedWinner GolsVencedor x GolsPerdedor]"` or `"[HomeTeam GolsCasa x GolsFora]"` for draws.
   - Check if this game is already in the README table. If it is (even as `*(aguardando)*`), **skip it** — do not duplicate or overwrite existing rows.

4. For each new guess not already in the table, append a new row to the table:
   ```
   | Home x Away | Palpite | *(aguardando)* | — | — | — | — |
   ```
   Insert it in chronological order if possible, or at the end of the table before the `---` separator.

5. Write the updated README.md.

## Notes

- Never overwrite or modify existing rows in the table.
- The Palpite column format must match existing rows: team name followed by score, e.g. `México 2 x 1` (predicted winner first, their goals first).
- For draws, use the home team name, e.g. `Suíça 1 x 1`.
- If `$ARGUMENTS` is empty, ask the user to provide the guesses.
