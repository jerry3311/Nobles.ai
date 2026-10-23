import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 1 << 20;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const trim = (value) => String(value ?? '').trim();
const field = (body, name) => body[name] == null ? '' : String(body[name]);
const parseBody = (raw) => {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt}$${key.toString('hex')}`);
    });
  });

const verifyPassword = async (password, storedHash) => {
  const [algorithm, salt, expectedHex] = String(storedHash).split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[\da-f]{128}$/i.test(expectedHex || '')) return false;
  const actualHash = await hashPassword(password, salt);
  const actual = Buffer.from(actualHash.split('$')[2], 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return crypto.timingSafeEqual(actual, expected);
};

const initializeDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
    CREATE TABLE IF NOT EXISTS learned_answers (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS learned_answers_user_id_idx ON learned_answers (user_id);
  `);
};

const createSession = async (client, userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  await client.query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes');",
    [token, userId]
  );
  return token;
};

const register = async (body) => {
  const username = trim(field(body, 'username')).toLowerCase();
  const password = field(body, 'password');
  const validPassword = password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!/^[a-z0-9_]{3,24}$/.test(username) || !validPassword) {
    throw new ApiError(400, 'Enter a valid username and a password that meets all the requirements.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN;');
    const passwordHash = await hashPassword(password);
    let result;
    try {
      result = await client.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id;',
        [username, passwordHash]
      );
    } catch (error) {
      if (error.code === '23505') throw new ApiError(400, 'That username is already taken.');
      throw error;
    }
    const token = await createSession(client, result.rows[0].id);
    await client.query('COMMIT;');
    return { success: true, token, username };
  } catch (error) {
    await client.query('ROLLBACK;');
    if (error instanceof ApiError) throw error;
    throw error;
  } finally {
    client.release();
  }
};

const login = async (body) => {
  const username = trim(field(body, 'username')).toLowerCase();
  const password = field(body, 'password');
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT id, password_hash FROM users WHERE username = $1;', [username]);
    if (rows.length === 0 || !(await verifyPassword(password, rows[0].password_hash))) {
      throw new ApiError(401, 'Invalid username or password.');
    }
    return { success: true, token: await createSession(client, rows[0].id), username };
  } finally {
    client.release();
  }
};

const authenticate = async (client, authHeader) => {
  const match = /^Bearer\s+(.+)$/i.exec(trim(authHeader));
  if (!match) throw new ApiError(401, 'Unauthorized. Please log in again.');
  const { rows } = await client.query(
    `UPDATE sessions SET expires_at = NOW() + INTERVAL '30 minutes'
     WHERE token = $1 AND expires_at > NOW() RETURNING user_id;`,
    [trim(match[1])]
  );
  if (!rows.length) throw new ApiError(401, 'Unauthorized. Please log in again.');
  return rows[0].user_id;
};

const sessionInfo = async (client, userId) => {
  const { rows } = await client.query(
    `SELECT users.username, COUNT(learned_answers.id)::int AS "learnedCount"
     FROM users LEFT JOIN learned_answers ON learned_answers.user_id = users.id
     WHERE users.id = $1 GROUP BY users.username;`,
    [userId]
  );
  if (!rows.length) throw new ApiError(401, 'Unauthorized. Please log in again.');
  return rows[0];
};

const teach = async (client, userId, body) => {
  const question = trim(field(body, 'question'));
  const answer = trim(field(body, 'answer'));
  if (!question || !answer || question.length > 500 || answer.length > 4000) {
    throw new ApiError(400, 'Question and answer are required (maximum 500 and 4000 characters).');
  }
  await client.query(
    'INSERT INTO learned_answers (user_id, question, answer) VALUES ($1, $2, $3);',
    [userId, question, answer]
  );
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM learned_answers WHERE user_id = $1;', [userId]);
  return { success: true, learnedCount: rows[0].count };
};

const SCHOOL_REPLIES = [
  [['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'], 'Hello! Welcome to Nobles International School. Ask me about admissions, fees, exams, the library and more.'],
  [['how are you', 'how is it going'], "I'm doing well, thanks for asking! What would you like to know about the school?"],
  [['your name', 'who are you', 'what are you'], "I'm Nobles Ai, the virtual assistant for Nobles International School. I can answer questions about the school."],
  [['thank', 'appreciate'], "You're very welcome! Is there anything else I can help you with?"],
  [['admission', 'enroll', 'enrol', 'application', 'apply', 'register'], "Admissions are open. You'll need a birth certificate, your last school report card, and two passport photographs. Visit the admin office to apply."],
  [['school fees', 'fee', 'tuition', 'payment', 'pay'], 'School fees can be paid in full or in two installments at the start of each term. Pay at the bursary or by bank transfer.'],
  [['timetable', 'time table', 'schedule', 'class time', 'lesson time'], 'Classes run from 8:00 AM to 2:30 PM, Monday to Friday. A fresh timetable is published at the start of each term.'],
  [['exam', 'test', 'assessment', 'midterm', 'final'], 'Mid-term tests are written in week 6, and final examinations are in the last two weeks of the term. The exam timetable is given out two weeks in advance.'],
  [['result', 'grade', 'score', 'marks', 'report card', 'report sheet'], 'Results are released two weeks after final exams and collected from the class teacher. A parent or guardian should sign the report sheet.'],
  [['library', 'book', 'borrow', 'librarian', 'reading'], 'The library is open from 7:30 AM to 5:00 PM on school days. Students may borrow two books for two weeks using their student ID card.'],
  [['hostel', 'dormitory', 'boarding', 'accommodation'], 'Boarding is available for students from Grade 7 upward. Hostels are separated by gender and supervised by a housemaster or housemistress.'],
  [['canteen', 'cafeteria', 'lunch', 'food', 'meal', 'breakfast'], 'The canteen serves breakfast, lunch and snacks. A weekly menu is posted every Monday, and students may bring lunch from home.'],
  [['sport', 'football', 'basketball', 'volleyball', 'swimming'], 'We offer football, basketball, volleyball, athletics and swimming. Sports practice is on Tuesdays and Thursdays after class.'],
  [['club', 'society', 'debate', 'drama', 'music', 'chess'], 'Clubs include Debate, Drama, Music, Chess, Science Club and Press Club. Sign up at the front office during the first week of term.'],
  [['holiday', 'vacation', 'break', 'resumption', 'closing date'], 'Each term lasts about 13 weeks, followed by a short mid-term break. Closing and resumption dates are announced a month ahead.'],
  [['contact', 'phone', 'telephone', 'email', 'address'], 'You can reach the school at +234-800-NOBLES or info@noblesinternational.edu. The front office is open from 8:00 AM to 4:00 PM.'],
  [['principal', 'headmaster', 'headmistress', 'administration'], "The Principal's office is on the first floor of the admin block. Appointments can be booked through the front desk."],
  [['uniform', 'dress code', 'wearing', 'appearance'], 'The school uniform is a white shirt with navy blue trousers or skirt, and black shoes. Sports wear is required on PE days.'],
  [['transport', 'bus', 'shuttle', 'pick up', 'drop off'], 'School buses cover most major routes. Bus fees are paid per term, and buses leave school at 3:00 PM.'],
  [['scholarship', 'financial aid', 'discount', 'concession'], 'Merit scholarships covering 25% to 100% of tuition are awarded based on academic performance. Applications open at the start of third term.'],
  [['attendance', 'absent', 'absence', 'late', 'punctual'], "Students should arrive before 8:00 AM. Three late arrivals count as one absence, and a parent's note is required after an absence."],
  [['homework', 'assignment', 'project', 'submission'], 'Homework is given daily and should be submitted the next morning. Major projects are announced two weeks early.'],
  [['teacher', 'staff', 'tutor', 'instructor'], 'Parents can meet teachers during the open day at the end of each month or book an appointment through the front office.'],
  [['subject', 'curriculum', 'syllabus', 'course'], 'Junior students take English, Mathematics, Basic Science, Social Studies, ICT and one language. Senior students choose Science, Arts or Commercial streams.'],
  [['rule', 'regulation', 'discipline', 'conduct', 'policy'], 'Key rules are to be punctual, wear the correct uniform, keep phones away during lessons, and respect staff and fellow students.'],
  [['school hours', 'opening time', 'closing time', 'what time'], 'The school opens at 7:30 AM, classes begin at 8:00 AM, and closing time is 2:30 PM. After-school clubs end by 4:30 PM.'],
  [['where is the school', 'location', 'located', 'direction'], 'Nobles International School is at 12 Learning Avenue, off Unity Road, a five-minute walk from Central Bus Stop.'],
  [['nurse', 'clinic', 'sick', 'first aid', 'emergency', 'medicine'], 'The school clinic is beside the science block and has a nurse during school hours. Parents are contacted immediately in an emergency.'],
  [['portal', 'login', 'website', 'e-learning'], 'The student portal lets you check results, fees and assignments. Login details are issued by the ICT department.'],
  [['lost', 'found', 'missing', 'misplaced'], 'Report lost items to the front office. Found items are kept in the Lost and Found box near reception for two weeks.'],
  [['bye', 'goodbye', 'farewell', 'see you'], 'Goodbye for now! Study hard, and come back whenever you need help.']
];

const chat = async (client, userId, body) => {
  const message = trim(field(body, 'message')).toLowerCase();
  if (!message || message.length > 2000) throw new ApiError(400, 'Enter a message up to 2000 characters.');
  const [{ rows: learnedRows }, { rows: countRows }] = await Promise.all([
    client.query(
      `SELECT answer FROM learned_answers
       WHERE user_id = $1 AND $2 LIKE '%' || LOWER(question) || '%'
       ORDER BY created_at DESC LIMIT 1;`,
      [userId, message]
    ),
    client.query('SELECT COUNT(*)::int AS count FROM learned_answers WHERE user_id = $1;', [userId])
  ]);

  let reply = learnedRows[0]?.answer;
  if (!reply && (message === 'topics' || message.includes('what can i ask') || message.includes('what do you know'))) {
    reply = 'Choose a subject from the Notice Board, or ask me about admissions, fees, exams, the library, transport, school hours and more.';
  } else if (!reply && (message === 'help' || message.includes('what can you do'))) {
    reply = 'Ask a question about Nobles International School, choose a topic from the Notice Board, or press Teach to add an answer.';
  } else if (!reply && (message === 'teach' || message.includes('teach me') || message.includes('teach you'))) {
    reply = 'Press the Teach button to add a question and its answer.';
  }
  if (!reply) {
    let bestScore = 0;
    for (const [keys, answer] of SCHOOL_REPLIES) {
      const score = keys.reduce((total, key) => total + (message.includes(key) ? 1 + Math.floor(key.length / 6) : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        reply = answer;
      }
    }
  }
  return {
    reply: reply || "I'm not sure about that yet. Try asking about fees, exams, admissions, the library, or another school topic.",
    learnedCount: countRows[0].count
  };
};

const publicRoutes = new Map([['/api/register', register], ['/api/login', login]]);
const protectedRoutes = new Map([['/api/session', sessionInfo], ['/api/teach', teach], ['/api/chat', chat]]);

const handleApi = async (req, url) => {
  if (req.method === 'OPTIONS') return { status: 204, payload: null };
  if (req.method === 'GET' && url.pathname === '/api/health') {
    await pool.query('SELECT 1;');
    return { status: 200, payload: { success: true } };
  }
  if (req.method !== 'POST' && url.pathname !== '/api/health') throw new ApiError(404, 'Route not found.');
  if (url.pathname === '/api/health') return { status: 200, payload: { success: true } };

  let body = {};
  if (req.method === 'POST') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new ApiError(413, 'Request body too large.');
      chunks.push(chunk);
    }
    body = parseBody(Buffer.concat(chunks).toString('utf8'));
  }
  const publicHandler = publicRoutes.get(url.pathname);
  if (publicHandler) return { status: 200, payload: await publicHandler(body) };
  const protectedHandler = protectedRoutes.get(url.pathname);
  if (!protectedHandler && url.pathname !== '/api/logout') throw new ApiError(404, 'Route not found.');

  const client = await pool.connect();
  try {
    const userId = await authenticate(client, req.headers.authorization ?? '');
    if (url.pathname === '/api/logout') {
      const token = /^Bearer\s+(.+)$/i.exec(trim(req.headers.authorization ?? ''))?.[1];
      await client.query('DELETE FROM sessions WHERE user_id = $1 AND token = $2;', [userId, token]);
      return { status: 200, payload: { success: true } };
    }
    const payload = url.pathname === '/api/session'
      ? await protectedHandler(client, userId)
      : await protectedHandler(client, userId, body);
    return { status: 200, payload };
  } finally {
    client.release();
  }
};

const sendJson = (res, status, payload) => {
  const body = payload === null ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
};

const serveFile = async (res, name, type) => {
  const contents = await fs.readFile(path.join(ROOT, name));
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': contents.length });
  res.end(contents);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      await serveFile(res, 'index.html', 'text/html; charset=utf-8');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/Screenshot%202026-10-19%20024928.png') {
      await serveFile(res, 'Screenshot 2026-10-19 024928.png', 'image/png');
      return;
    }
    const { status, payload } = await handleApi(req, url);
    sendJson(res, status, payload);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Internal server error.';
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.destroy(error);
  }
});

const start = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL.');
    process.exit(1);
  }
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Database connection or schema initialization failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  server.listen(PORT, () => console.log(`Nobles Ai running at http://localhost:${PORT}`));
};

const shutdown = async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', async (error) => {
  console.error('Could not start the Nobles Ai server:', error.message);
  await pool.end();
  process.exit(1);
});
start().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
