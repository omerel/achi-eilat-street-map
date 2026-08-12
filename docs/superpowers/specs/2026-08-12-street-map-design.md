# מפת שכונה — אח"י אילת, זכרון יעקב

תאריך: 2026-08-12

## מטרה

אתר קהילתי ל-40 הבתים ברחוב אח"י אילת בזכרון יעקב. מציג מפה עם הפוליגונים
הרשמיים (גוש/חלקה) של כל בית ברחוב, ומאפשר לכל דייר לצפות ולערוך פרטי קשר של
בעלי הבתים דרך לחיצה על הפוליגון במפה. כל דייר יכול לערוך כל בית (סיסמה
משותפת אחת לכל השכונה, לא הרשאות פר-בית).

## ארכיטקטורה

אתר סטטי בעמוד יחיד (HTML/CSS/JS + Leaflet.js), ללא build step וללא framework
כבד. כל הקריאה קורית ישירות מהדפדפן. הכתיבה (עריכת פרטי בית) עוברת דרך
Cloudflare Worker קטן שמחזיק בסוד את הרשאת הכתיבה ל-GitHub.

```
דפדפן (GitHub Pages, סטטי)
   │  קריאה: WFS ישירות מ-open.govmap.gov.il (פוליגוני חלקות)
   │  קריאה: הצפ"א מ-Esri World Imagery (רקע לוויני)
   │  קריאה: houses.json מ-raw.githubusercontent.com
   │  כתיבה: POST ל-Cloudflare Worker (סיסמה + פרטים מעודכנים)
   ▼
Cloudflare Worker (secrets: SHARED_PASSWORD, GITHUB_TOKEN)
   │  בודק סיסמה → שולף sha נוכחי → מעדכן → מבצע קומיט
   ▼
GitHub Contents API → houses.json ב-repo הציבורי
```

**עלות: 0.** GitHub Pages, Cloudflare Workers (free tier), Esri World Imagery
ו-WFS הממשלתי — כולם חינמיים וללא מפתח API.

## שכבות המפה

- **רקע**: Esri World Imagery (תצלום לוויני/אווירי חינמי, ללא מפתח) —
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer`
- **שכבת-על (חלקות)**: WFS ממשלתי, GeoServer של מפ"י/Survey of Israel, נבדק
  ועובד בפועל:
  - שכבה: `opendata:PARCEL_ALL`
  - endpoint: `https://open.govmap.gov.il/geoserver/opendata/ows`
  - פורמט: GeoJSON (`outputFormat=application/json`), CRS `EPSG:3857`
  - ציבורי, ללא אימות, עם `Access-Control-Allow-Origin: *` (קריאה ישירה
    מהדפדפן ללא proxy)
  - שדות רלוונטיים בתגובה: `GUSH_NUM`, `PARCEL`, `ID` (בפורמט `"גוש--חלקה"`),
    `LOCALITY_N` (שם יישוב — לאימות שהחלקה בזכרון יעקב)
- הפוליגונים נשלפים **פעם אחת בטעינת העמוד**, מוגבלים ל-bounding box קבוע
  שתוחם רק את רחוב אח"י אילת (קבוע בקוד; יימצא בשלב ההקמה — ראו "צעדי הקמה
  חד-פעמיים" למטה).
- מפתח חיבור (join key) בין פוליגון לנתוני הבית: `GUSH_NUM` + `PARCEL`
  (למשל `"11316--47"`).

## מודל נתונים — `houses.json`

קובץ JSON שטוח אחד בשורש ה-repo, מפתח = מזהה חלקה:

```json
{
  "11316--47": {
    "address_title": "אח\"י אילת 8",
    "residents": "משפחת כהן",
    "phone": "050-1234567",
    "contact_note": "",
    "updated_by": "יוסי",
    "updated_at": "2026-08-12T10:00:00Z"
  }
}
```

- `address_title` — כותרת הבית (רחוב + מספר). נטען אוטומטית בשלב ההקמה, וניתן
  לתקן ידנית בעריכה כמו כל שדה אחר.
- `updated_at` — נקבע **בצד השרת** (Worker), לא מתקבל מהלקוח, כדי שלא ניתן
  לזייף אותו.
- אין צורך בלוג שינויים נפרד — היסטוריית ה-commits של git על הקובץ הזה *היא*
  היסטוריית העריכות (מי ומתי, בחינם).

## זרימת משתמש

1. טעינת העמוד → מפה מרכזת על הרחוב, פוליגוני חלקות מצוירים מעל תצ"א.
2. חלקה עם נתונים קיימים בולטת ויזואלית (למשל צבע שונה) לעומת חלקה ריקה.
3. לחיצה על פוליגון → פותחת popup: כותרת כתובת, שמות דיירים, טלפון/הערת קשר,
   ושורה קטנה "עודכן ע״י X בתאריך Y".
4. כפתור "ערוך" ב-popup → טופס עריכה (כותרת כתובת, שמות, טלפון, הערה, שם
   המעדכן) + שדה סיסמה.
5. שליחה → קריאת POST ל-Worker. הצלחה → הטופס נסגר, ה-popup מתעדכן עם הנתונים
   החדשים (מבוסס על תשובת ה-Worker, ללא צורך להמתין ל-refetch). כישלון (סיסמה
   שגויה) → הודעת שגיאה בטופס, בלי לאפס את מה שהוזן.

## Cloudflare Worker — API כתיבה

- endpoint יחיד, למשל `POST /update-house`
- body: `{ parcelId, password, address_title, residents, phone, contact_note, updated_by }`
- לוגיקה:
  1. משווה `password` ל-secret `SHARED_PASSWORD`. לא תואם → `403`.
  2. סניטציה בסיסית לאורך שדות (מניעת body ענק).
  3. `GET` ל-GitHub Contents API לקבלת ה-`sha` הנוכחי של `houses.json`.
  4. מעדכן את המפתח המתאים ב-JSON, קובע `updated_at` (זמן שרת).
  5. `PUT` ל-GitHub Contents API עם `sha` ותוכן מקודד ב-base64, secret
     `GITHUB_TOKEN`.
  6. אם GitHub מחזיר 409 (sha התיישן עקב כתיבה מקבילה) — מנסה שוב פעם אחת
     (fetch sha טרי + PUT חוזר). כשל שני → מחזיר שגיאה ללקוח.
  7. מחזיר ללקוח את רשומת הבית המעודכנת (כולל `updated_at` שנקבע בשרת).

## אבטחה ופרטיות

- הסיסמה המשותפת קיימת רק כ-secret בצד ה-Worker; אינה מגיעה לקוד הלקוח.
- `GITHUB_TOKEN`: Fine-grained Personal Access Token עם הרשאת `Contents:Write`
  על ה-repo הספציפי הזה בלבד (לא הרשאה גורפת לחשבון).
- כל טקסט שהוזן ע"י משתמשים (שמות, הערות) מוצג ב-DOM דרך `textContent`
  ולא `innerHTML`, כדי למנוע Stored XSS.
- **הצפייה בנתונים פתוחה לכל מי שמכיר את כתובת האתר, ללא סיסמה** (רק העריכה
  מוגנת). הוחלט מודעות לכך — קהילת יעד סגורה, לא מידע רגיש ברמת סיכון גבוהה.
  מגבלה: GitHub Pages בחינם דורש repo ציבורי.
  - מגן: `robots.txt` עם `Disallow: /` + מטא-תג `<meta name="robots" content="noindex">`
    כדי שהאתר לא יופיע בתוצאות חיפוש.

## פריסה וצעדי הקמה חד-פעמיים

1. יצירת repo ציבורי חדש ב-GitHub, הפעלת GitHub Pages מהענף הראשי.
2. איתור ה-bounding box המדויק של רחוב אח"י אילת (למשל דרך חיפוש כתובת ב-
   govmap.gov.il או OSM), וקיבועו כקבוע בקוד ה-frontend.
3. סקריפט חד-פעמי (Node/Python, מריצים מקומית, לא חלק מהאתר הרץ):
   - שולף מה-WFS את כל החלקות בתוך ה-bounding box.
   - עבור כל חלקה, reverse-geocode של מרכז הפוליגון דרך Nominatim
     (`nominatim.openstreetmap.org/reverse`) לקבלת `house_number` + `road`.
   - בונה את `houses.json` הראשוני (רק `address_title` ממולא; שאר השדות
     ריקים, מוכנים לעריכה ע"י דיירים).
4. יצירת Cloudflare Worker, הגדרת secrets `SHARED_PASSWORD` ו-`GITHUB_TOKEN`.
5. עדכון קוד ה-frontend עם כתובת ה-Worker וה-bounding box.

## מחוץ לתחום (Out of scope)

- הרשאות פר-משתמש/פר-בית (יש סיסמה משותפת אחת בלבד).
- שליפת בעלות רשמית מרשם המקרקעין (טאבו) — המידע הוא קהילתי-התנדבותי בלבד.
- היסטוריית שינויים ב-UI (זמינה דרך git log לפי הצורך, לא מוצגת באתר).
