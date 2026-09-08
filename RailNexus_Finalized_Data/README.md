# RailNexus Finalized Data Package

## Validation status
All populated finalized datasets were re-validated with zero missing cells, zero duplicate rows, valid station/section/train references, non-negative movement durations, and chronologically ordered timetable sequences.

## Important correction
The received station record `CHP / CHHAPI` was inconsistent with the Mumbai Central corridor use. It has been corrected to `CHG / CHINCHPOKLI` using verified station identity/coordinate references. Section endpoints and related schedule station codes were updated accordingly.

## Time normalization
The movement/schedule outputs contained reverse-direction records with entry/exit times recorded in descending order. The finalized analytical datasets normalize direction/chronology using the provided timing evidence. Residual inverted movement time pairs were corrected only by swapping the paired time values; no new timestamps were invented. Empty schedule artifact rows with no sequence/time/day information were removed.

## Geometry
`gis/station_points.geojson` contains verified station points from the finalized station master. `gis/section_schematic.geojson` contains derived station-to-station schematic lines for visualization. These lines are NOT authoritative railway track geometry.

## Live location
No verified live telemetry/GPS source was present in the received package. `realtime/train_positions.csv` is therefore a schema-only file. Do not simulate moving trains.

## Future datasets
Asset, restrictions, block, incident, historical-delay, and maintenance-outcome files are schema-only because no verified source rows were provided. They must be populated from real sources before being used in operational scoring.
