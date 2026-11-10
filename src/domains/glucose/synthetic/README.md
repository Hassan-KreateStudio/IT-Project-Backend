# Synthetic glucose lookup

A day that has activity and no glucose reading gets three readings. Each one is a real continuous-glucose value from ShanghaiT2DM, copied from the clock hour for that slot. The generator does not fit a curve, add a daily shift, or clamp the number. `synthetic: true` is still set when the reading is written.

The value does not depend on that day's step count.

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

The reading is stored at the midpoint of its window, on the activity day, in the location the caller passes. The API uses Africa/Nairobi, so the three timestamps are 05:30, 13:30, and 19:30 East Africa Time.

Rows in the CSV stay in workbook filename order, then timestamp, then source row. Sampling draws an index into that list, so a repeated value is as likely as it was in the hour. The largest after-dinner value, 468.0 mg/dL, is the 19:29 reading on 14 October 2021 in `2021_0_20211013.xls`.

## Seed

`Day` takes a `math/rand` source. The sync path and the `-seed` flag (default `42`, `synthetic.DefaultSeed`) use one so the same empty days copy the same rows. Tests pass their own source. The seed does not create the glucose number.

## Rebuild the table

The zip is not in this repo. From the repo root, with the figshare file above:

```sh
pip install openpyxl 'xlrd==1.2.0'
python3 scripts/extract_shanghait2dm_slots.py /path/to/diabetes_datasets.zip
```

`xlrd` 1.2.0 is required because later releases do not read `.xls`. The script writes `shanghai_t2dm_slots.csv`. The API embeds that file, so a rebuilt table needs a recompile. No new environment variable is required at deploy time.
