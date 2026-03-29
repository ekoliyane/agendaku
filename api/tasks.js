const { neon } = require('@neondatabase/serverless');

function getDb() {
  return neon(process.env.DATABASE_URL);
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      notes TEXT DEFAULT '',
      link TEXT DEFAULT '',
      done BOOLEAN DEFAULT false,
      carry_over BOOLEAN DEFAULT false,
      original_id TEXT DEFAULT '',
      from_date TEXT DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date)`;
}

function rowToTask(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    text: row.text,
    priority: row.priority,
    notes: row.notes || '',
    link: row.link || '',
    done: row.done,
    carryOver: row.carry_over,
    originalId: row.original_id || '',
    fromDate: row.from_date || '',
    createdAt: Number(row.created_at) || 0
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();

  try {
    await ensureTable(sql);
    const { method } = req;

    // GET /api/tasks?user_id=xxx           → all tasks for user
    // GET /api/tasks?user_id=xxx&date=xxx  → tasks for user+date
    if (method === 'GET') {
      const { date, user_id } = req.query;
      const uid = user_id || '';

      if (date) {
        const rows = await sql`SELECT * FROM tasks WHERE user_id = ${uid} AND date = ${date} ORDER BY created_at`;
        return res.json({ tasks: rows.map(rowToTask) });
      } else {
        const rows = await sql`SELECT * FROM tasks WHERE user_id = ${uid} ORDER BY date DESC, created_at ASC`;
        const dates = {};
        rows.forEach(row => {
          const t = rowToTask(row);
          if (!dates[t.date]) dates[t.date] = [];
          dates[t.date].push(t);
        });
        return res.json({ dates });
      }
    }

    // POST /api/tasks → add task
    if (method === 'POST') {
      const t = req.body;
      await sql`
        INSERT INTO tasks (id, user_id, date, text, priority, notes, link, done, carry_over, original_id, from_date, created_at)
        VALUES (${t.id}, ${t.user_id || ''}, ${t.date}, ${t.text}, ${t.priority || 'medium'}, ${t.notes || ''}, ${t.link || ''},
                ${t.done || false}, ${t.carryOver || false}, ${t.originalId || ''}, ${t.fromDate || ''}, ${t.createdAt || Date.now()})
      `;
      return res.json({ success: true });
    }

    // PUT /api/tasks → update task
    if (method === 'PUT') {
      const t = req.body;
      if (!t.id) return res.status(400).json({ error: 'Missing id' });
      if (t.text !== undefined) await sql`UPDATE tasks SET text = ${t.text} WHERE id = ${t.id}`;
      if (t.notes !== undefined) await sql`UPDATE tasks SET notes = ${t.notes} WHERE id = ${t.id}`;
      if (t.link !== undefined) await sql`UPDATE tasks SET link = ${t.link} WHERE id = ${t.id}`;
      if (t.done !== undefined) await sql`UPDATE tasks SET done = ${t.done} WHERE id = ${t.id}`;
      if (t.priority !== undefined) await sql`UPDATE tasks SET priority = ${t.priority} WHERE id = ${t.id}`;
      return res.json({ success: true });
    }

    // DELETE /api/tasks?id=xxx
    if (method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      await sql`DELETE FROM tasks WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
