# Synthetic glucose lookup

A day that has activity and no glucose reading gets three readings. Each one is a real continuous-glucose value from ShanghaiT2DM, copied from the clock hour for that slot. The generator does not fit a curve, add noise, or change the number. `synthetic: true` is still set when the reading is written.

The day's step count decides which third of that slot can be copied. A day with more steps is given a real reading from the lower-glucose third of that time of day, and a day with fewer steps is given one from the higher-glucose third. The link is planted on purpose, and it is disclosed, so the graph analysis has a known pattern to recover. It is not a measurement of that patient's glucose.

## Step bands

The count is the sum of the `Steps` nodes on that day, which is the same total the dashboard rolls up. The bands meet at the stated round numbers, and both 5,000 and 10,000 are medium:

| Band | Steps | Glucose third copied |
|---|---|---|
| low | below 5,000 | high |
| medium | 5,000 through 10,000, both ends included | middle |
| high | above 10,000 | low |

4,999 is low, 5,000 and 10,000 are medium, and 10,001 is high. A count of 0 is a real count and uses the low band. Any count below 5,000 does too.

A day with no `Steps` node has no band. Nothing is written for it, and synthetic readings already stored on it are left as they are. That day does not draw, so it does not move the seed used for the days that do have a count.

## Terciles

For each slot the committed readings are sorted ascending and split by rank into three groups. The low and middle groups each hold `n / 3` readings (integer division). The high group keeps the remainder: one reading for after lunch, and none for the other two slots. Sampling draws one index inside the chosen group, so a repeated value is as likely as it was inside that group. The copied number is still that exact row.

The groups meet on a shared mg/dL, because several real readings have the same value. That cut value is in both groups that meet there. It is not a hard threshold.

| Slot | Low third | Cut | Middle third | Cut | High third |
|---|---|---:|---|---:|---|
| fasting | 39.6–100.8 (1,579) | 100.8 | 100.8–127.8 (1,579) | 127.8 | 127.8–289.8 (1,579) |
| after_lunch | 39.6–124.2 (1,536) | 124.2 | 124.2–167.4 (1,536) | 167.4 | 167.4–417.6 (1,537) |
| after_dinner | 39.6–126.0 (1,585) | 126.0 | 126.0–171.0 (1,585) | 171.0 | 171.0–468.0 (1,585) |

Ranges are mg/dL. The two cut columns are the shared boundary values.

## Source

Zhao, Q., Zhu, J., Shen, X. et al. Chinese diabetes datasets for data-driven machine learning. *Scientific Data* 10, 35 (2023). https://doi.org/10.1038/s41597-023-01940-7

The file used here is:

Zhao, Qinpei; Zhu, Jinhao; Wang, Congrong; Rao, Weixiong (2022). *diabetes_datasets.zip*. figshare. Dataset. https://doi.org/10.6084/m9.figshare.21600933.v5

That item is CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). MD5 of the zip: `4bfb61cfa506b48155fd9e841ee48e21`.

`shanghai_t2dm_slots.csv` is a subset, not the original dataset. It keeps the CGM column from the `Shanghai_T2DM` workbooks only (100 patients, 109 files), and only the rows whose timestamp falls in one of the three hours below. Diet, insulin, ketones, capillary glucose, and the clinical summary sheet are not included. ShanghaiT1DM is not included. The original dates are not copied onto the synthetic reading; only the mg/dL value is.

The CGM column is already mg/dL (`CGM (mg / dl)`). Two workbooks label it `CGM ` without the unit text; those values are on the same scale and are included. Every retained value was already on a 0.1 mg/dL grid, so writing one decimal place did not change a reading. Blank CGM cells are omitted: 13 of them are the sensor change in `2029_0_20210526` (the publisher's `note.txt` says those values are missing), and the rest are empty trailing rows. 112,462 numeric CGM rows were read from the workbooks.

## Slots

The workbook `Date` column is the local time of the Shanghai recording. It is not converted to UTC or to Africa/Nairobi. A row belongs to a slot when that clock time falls in a half-open hour:

| Slot | Window | Readings | Patients | Files | Min | Mean | Max |
|---|---|---:|---:|---:|---:|---:|---:|
| fasting | 05:00 ≤ t < 06:00 | 4,737 | 100 | 109 | 39.6 | 117.94 | 289.8 |
| after_lunch | 13:00 ≤ t < 14:00 | 4,609 | 100 | 109 | 39.6 | 153.53 | 417.6 |
| after_dinner | 19:00 ≤ t < 20:00 | 4,755 | 100 | 109 | 39.6 | 154.37 | 468.0 |

The mean is the arithmetic mean of the committed column, rounded to two decimal places. The exact ratios are 558678.6/4737, 707639.4/4609, and 734047.2/4755 mg/dL.

The hours follow the dietary logs in the same workbooks (a non-empty `Dietary intake` cell):

- Breakfast logs peak at 07:00–07:59 (575) and are already common at 06:00–06:59 (321). The 05:00 hour has 44 logs, 41 of them at 05:45–05:59, so it is the last hour that is still mostly before breakfast.
- Lunch logs peak at 11:00–11:59 (677). 13:00–14:00 starts two hours later. That hour itself contains 67 dietary logs.
- Dinner logs peak at 17:00–17:59 (640). 19:00–20:00 starts two hours later. That hour itself contains 101 dietary logs.

The reading is stored at the midpoint of its window, on the activity day, in the location the caller passes. The API uses Africa/Nairobi (UTC+3, no daylight saving), so the three timestamps are 05:30, 13:30, and 19:30 East Africa Time. The offset is a fixed zone in code. The Alpine image has no zoneinfo database, and `time.LoadLocation` was failing and falling back to UTC, which stored those wall times as 05:30Z, 13:30Z, and 19:30Z. A Nairobi phone then showed 08:30, 16:30, and 22:30. The stored instants are 02:30Z, 10:30Z, and 16:30Z.

Rows in the CSV stay in workbook filename order, then timestamp, then source row. The tercile split sorts a copy of each slot. It does not reorder the file. The largest after-dinner value, 468.0 mg/dL, is the 19:29 reading on 14 October 2021 in `2021_0_20211013.xls`.

## Seed

`Day` takes the step count and a `math/rand` source. The count selects the third. The source selects the row inside that third. The sync path and the `-seed` flag (default `42`, `synthetic.DefaultSeed`) use one source, and walk days oldest first (patients who share a date are walked by id), so the same days and the same step counts copy the same rows. A day with no step count does not draw. Tests pass their own source. The seed does not create the glucose number. Two counts in the same band copy the same rows when the seed is the same, because the third does not change.

## Replace readings already stored

A sync fills days that still have no glucose. It does not rewrite a day that already has `synthetic: true` readings. To rebuild those with this rule, against the Neo4j the process is configured to open:

```sh
go run ./src -backfill-glucose -replace-synthetic
```

`-dry-run` prints the rows and writes nothing. `-seed` defaults to 42.

The flag deletes `synthetic: true` readings only on days whose glucose readings are all synthetic, and only when that day has a step count, then writes three new ones. A day that also has a real reading is left alone. A day with no step count is left alone, including any synthetic readings already on it. The same run still fills activity days that have no reading yet. Point the command at the database you mean to rewrite.

## Rebuild the table

The zip is not in this repo. From the repo root, with the figshare file above:

```sh
pip install openpyxl 'xlrd==1.2.0'
python3 scripts/extract_shanghait2dm_slots.py /path/to/diabetes_datasets.zip
```

`xlrd` 1.2.0 is required because later releases do not read `.xls`. The script writes `shanghai_t2dm_slots.csv`. The API embeds that file, so a rebuilt table needs a recompile. No new environment variable is required at deploy time.
