const fs = require('fs');
const csv = require('csv-parser');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function importCSV() {
  const csvFile = process.argv[2];

  if (!csvFile) {
    console.error('Nutzung: node import-karafun.js <path-to-csv>');
    console.error('Bsp: node import-karafun.js karafun-catalog.csv');
    process.exit(1);
  }

  if (!fs.existsSync(csvFile)) {
    console.error(`Datei nicht gefunden: ${csvFile}`);
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('📂 CSV-Datei lesen...');

  // Erst komplett einlesen, dann sequenziell importieren - so läuft der
  // Import garantiert vollständig durch, bevor der Pool geschlossen wird
  // (bei ~21'000 Zeilen parallel/unkontrolliert per 'data'-Event bricht
  // pool.end() sonst noch wartende Inserts vorzeitig ab).
  const rows = await new Promise((resolve, reject) => {
    const collected = [];
    fs.createReadStream(csvFile)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => collected.push(row))
      .on('end', () => resolve(collected))
      .on('error', reject);
  });

  console.log(`📄 ${rows.length} Zeilen gelesen, importiere...`);

  let count = 0;
  let errors = 0;
  const connection = await pool.getConnection();

  try {
    for (const row of rows) {
      try {
        // CSV-Spalten mapping - aktuelles KaraFun-Export-Format:
        // Id;Title;Artist;Year;Duo;Explicit;Date Added;Styles;Languages
        const title = row['Title'] || row['Song'] || row['title'] || '';
        const artist = row['Artist'] || row['artist'] || '';
        const genre = row['Styles'] || row['Genre'] || row['genre'] || '';
        const year = parseInt(row['Year'] || row['year'] || 0);
        const language = row['Languages'] || row['Language'] || row['language'] || '';
        const karafunId = row['Id'] || row['ID'] || row['id'] || '';
        const duo = (row['Duo'] || row['duo'] || '0').trim() === '1' ? 1 : 0;
        const explicit = (row['Explicit'] || row['explicit'] || '0').trim() === '1' ? 1 : 0;

        if (!title || !artist) {
          errors++;
          continue;
        }

        // ON DUPLICATE KEY UPDATE statt INSERT IGNORE: ein erneuter Import
        // (z.B. um das Duo-Feld für schon vorhandene Songs nachzutragen)
        // aktualisiert bestehende Zeilen mit, statt sie zu ignorieren.
        await connection.query(
          `INSERT INTO songs (title, artist, genre, year, language, karafun_id, duo, explicit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE genre = VALUES(genre), year = VALUES(year),
                                    language = VALUES(language), duo = VALUES(duo),
                                    explicit = VALUES(explicit)`,
          [title, artist, genre, year || null, language, karafunId || null, duo, explicit]
        );

        count++;
        if (count % 100 === 0) {
          console.log(`✅ ${count} Songs importiert...`);
        }
      } catch (error) {
        errors++;
        console.error('Zeilen-Fehler:', error.message);
      }
    }
    // Von KaraFun als "explicit" markierte Songs automatisch zur Prüfung
    // markieren (nicht sperren) - aber nur, wenn noch niemand den Song
    // manuell klassifiziert hat, damit ein erneuter Import nie eine bewusste
    // Admin-Entscheidung überschreibt.
    const [reviewResult] = await connection.query(
      "UPDATE songs SET filter_status = 'review', filter_reason = 'Explizit laut KaraFun-Katalog' " +
      "WHERE explicit = 1 AND filter_status = 'none'"
    );
    console.log(`⚠️ ${reviewResult.affectedRows} explizite Songs automatisch zur Prüfung markiert`);
  } finally {
    connection.release();
    await pool.end();
  }

  console.log(`\n✅ Import abgeschlossen!`);
  console.log(`📊 ${count} Songs hinzugefügt`);
  if (errors > 0) {
    console.log(`⚠️ ${errors} Fehler`);
  }
}

importCSV().catch((error) => {
  console.error('Fehler:', error);
  process.exit(1);
});
