const { neon } = require('@neondatabase/serverless');

function getDb() {
  return neon(process.env.DATABASE_URL);
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
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
  // Index for fast date lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)`;
}

function rowToTask(row) {
  return {
    id: row.id,
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();

  try {
    await ensureTable(sql);
    const { method } = req;

    // GET /api/tasks?date=YYYY-MM-DD  → get tasks for a date
    // GET /api/tasks                  → get all tasks (grouped by date)
    if (method === 'GET') {
      const { date } = req.query;
      if (date) {
        const rows = await sql`SELECT * FROM tasks WHERE date = ${date} ORDER BY created_at`;
        return res.json({ tasks: rows.map(rowToTask) });
      } else {
        const rows = await sql`SELECT * FROM tasks ORDER BY date DESC, created_at ASC`;
        const dates = {};
        rows.forEach(row => {
          const t = rowToTask(row);
          if (!dates[t.date]) dates[t.date] = [];
          dates[t.date].push(t);
        });
        return res.json({ dates });
      }
    }

    // POST /api/tasks → add a new task
    if (method === 'POST') {
      const t = req.body;
      await sql`
        INSERT INTO tasks (id, date, text, priority, notes, link, done, carry_over, original_id, from_date, created_at)
        VALUES (${t.id}, ${t.date}, ${t.text}, ${t.priority || 'medium'}, ${t.notes || ''}, ${t.link || ''}, 
                ${t.done || false}, ${t.carryOver || false}, ${t.originalId || ''}, ${t.fromDate || ''}, ${t.createdAt || Date.now()})
      `;
      return res.json({ success: true, task: t });
    }

    // PUT /api/tasks → update a task
    if (method === 'PUT') {
      const t = req.body;
      if (!t.id) return res.status(400).json({ error: 'Missing task id' });

      // Build dynamic update
      const updates = {};
      if (t.text !== undefined) updates.text = t.text;
      if (t.notes !== undefined) updates.notes = t.notes;
      if (t.link !== undefined) updates.link = t.link;
      if (t.done !== undefined) updates.done = t.done;
      if (t.priority !== undefined) updates.priority = t.priority;

      // Execute individual updates (neon tagged template doesn't support dynamic column names easily)
      if (t.text !== undefined) await sql`UPDATE tasks SET text = ${t.text} WHERE id = ${t.id}`;
      if (t.notes !== undefined) await sql`UPDATE tasks SET notes = ${t.notes} WHERE id = ${t.id}`;
      if (t.link !== undefined) await sql`UPDATE tasks SET link = ${t.link} WHERE id = ${t.id}`;
      if (t.done !== undefined) await sql`UPDATE tasks SET done = ${t.done} WHERE id = ${t.id}`;
      if (t.priority !== undefined) await sql`UPDATE tasks SET priority = ${t.priority} WHERE id = ${t.id}`;

      return res.json({ success: true });
    }

    // DELETE /api/tasks?id=xxx → delete a task
    if (method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing task id' });
      await sql`DELETE FROM tasks WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
