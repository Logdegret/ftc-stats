# Hiveboard — FTC driver stats and scouting

A browser-based tracker for FTC BIOBUZZ training, matches, and team scouting.

- Log both people in one training or match session, with Driver, Shooter, or Both role tags.
- The Driver role records hive tips, Shooter records shots and pollen, and Both exposes every field.
- Track pollen shots attempted and landed, hive tips, and pollen remaining in a hive cell for each person.
- Compare driver accuracy and estimated hive points across training and matches.
- Compare two-driver combinations by projected points per run and points per shot.
- Look up FTC team profiles and every ranked season available through FTCScout.
- Review a preliminary partner outlook based on within-season rank percentiles, with recent seasons weighted more heavily and local reliability notes included.
- Record team scouting observations, reliability ratings, and notes.
- Export driver and scouting data as CSV. Driver CSV files can also be imported.

Data is stored locally in each browser. It is not synchronized across devices. Team profiles come from FTCScout, an independent service; individual scouting observations remain local and are not official match scores.

GitHub Pages deploys automatically when `main` changes. The site is static and needs no build step.
