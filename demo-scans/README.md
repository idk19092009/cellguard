# Selected presentation scans

Upload these on the CellGuard main page:

| File | Expected classifier result | Location behavior |
| --- | --- | --- |
| `Normal/24.png` | Normal | No target or movement |
| `Benign/LUNGX-CT036_n1.png` | Benign | AI point near (150, 392) px |
| `Malignant/LUNGX-CT041_n1.png` | Malignant | AI point near (107, 292) px |

The Benign and Malignant images are TCIA LUNGx known-nodule slices (CC BY 3.0). The Normal image is from dorsar/lung-cancer. These were selected after observing results and do not measure accuracy. Review each marker before confirming; the published LUNGx reference is an approximate 2D point, not a verified 3D target or box.
