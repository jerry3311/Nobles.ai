const express = require('express');
const { neon } = require('@neondatabase/serverless');
const path = require('path');

const app = express();
app.use(express.json());

// Serve the frontend HTML from the "frontend" folder
app.use(express.static(path.join(__dirname, '../frontend')));

// CORS (allows your frontend to talk to your backend)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ==========================================
// KNOWLEDGE BASE (Ported from your C++ code)
// ==========================================
const knowledge = [];
function addIntent(name, keywords, response) {
  knowledge.push({ name, keywords: keywords.split('|'), response });
}

addIntent('greeting', 'hello|hi|hey|greetings|good morning|good afternoon|good evening',
  "Hello! Welcome to NOBLES Academy's virtual assistant. Ask me about admissions, fees, exams, the library and more.");
addIntent('how_are_you', 'how are you|how is it going|how do you do|how are things',
  "I'm running perfectly, thanks for asking! What would you like to know about the school?");
addIntent('identity', 'your name|who are you|what are you|about you|introduce yourself',
  "I'm AKPAETTE, the virtual assistant for NOBLES Academy. I can answer questions about the school and even learn new answers from you.");
addIntent('thanks', 'thank|thanks|thank you|appreciate it|grateful',
  "You're very welcome! Is there anything else I can help you with?");
addIntent('admission', 'admission|admissions|enroll|enrol|enrollment|apply|application|register',
  "Admissions are open! You'll need a birth certificate, the last school report card, and two passport photographs. Visit the admin office or apply online through the school portal.");
addIntent('fees', 'fee|fees|tuition|payment|pay|school fees',
  "School fees can be paid in full or in two installments at the start of each term. You can pay at the bursary or by bank transfer. Part-payment plans are available for families who need them.");
addIntent('timetable', 'timetable|time table|schedule|class time|period|lesson time',
  "Classes run from 8:00 AM to 2:30 PM, Monday to Friday. A fresh timetable is published at the start of every term and is also posted on the class noticeboard.");
addIntent('exams', 'exam|exams|examination|examinations|test|tests|assessment|midterm|final',
  "Mid-term tests are written in week 6, and final examinations in the last two weeks of the term. A detailed exam timetable is given out two weeks in advance.");
addIntent('results', 'result|results|grade|grades|score|marks|report card|report sheet',
  "Results are released two weeks after the final exams and are collected from the class teacher. Report sheets must be signed by a parent or guardian.");
addIntent('library', 'library|book|books|borrow|librarian|reading',
  "The library is open from 7:30 AM to 5:00 PM on school days. Students may borrow up to two books at a time for two weeks. Bring your student ID card to borrow.");
addIntent('hostel', 'hostel|hostels|dorm|dormitory|boarding|accommodation|boarder',
  "Boarding facilities are available for students from Grade 7 upward. Hostels are separated by gender, with a housemaster or housemistress on duty at all times.");
addIntent('canteen', 'canteen|cafeteria|lunch|food|meal|meals|breakfast',
  "The canteen serves breakfast, lunch and snacks. A weekly menu is posted every Monday. Students may also bring packed lunch from home.");
addIntent('sports', 'sport|sports|games|football|basketball|volleyball|athletics|swimming',
  "We offer football, basketball, volleyball, athletics and swimming. Sports practice holds on Tuesdays and Thursdays after class, and inter-house competitions happen once a term.");
addIntent('clubs', 'club|clubs|society|societies|debate|drama|music|chess|extracurricular',
  "Clubs include Debate, Drama, Music, Chess, Science Club and the Press Club. Sign-up forms are available at the front office during the first week of each term.");
addIntent('holidays', 'holiday|holidays|vacation|break|resumption|resume|closing date',
  "Each term runs for about 13 weeks, followed by a short mid-term break. Closing and resumption dates are announced a month ahead and printed on the school calendar.");
addIntent('contact', 'contact|phone|telephone|email|address|reach you|office hours',
  "You can reach the school on +234-800-NOBLES or email info@NOBLESacademy.edu. The front office is open from 8:00 AM to 4:00 PM.");
addIntent('principal', 'principal|headmaster|headmistress|head teacher|administration|admin|vice principal',
  "The Principal's office is on the first floor of the admin block. Appointments can be booked through the front desk. The Vice Principal handles day-to-day student matters.");
addIntent('uniform', 'uniform|dress code|wear|wearing|appearance',
  "The school uniform is a white shirt with navy blue trousers or skirt, and black shoes. Sports wear is required only on PE days. Neatness is checked every morning.");
addIntent('transport', 'transport|bus|buses|shuttle|pick up|drop off|school bus',
  "School buses cover most major routes. The bus fee is paid per term. Buses leave the school at 3:00 PM sharp, so please be at the pickup point on time.");
addIntent('scholarship', 'scholarship|scholarships|bursary|financial aid|discount|concession',
  "Merit scholarships covering 25% to 100% of tuition are awarded each session based on academic performance. Applications open at the start of the third term.");
addIntent('attendance', 'attendance|absent|absence|late|latness|lateness|punctual',
  "Students must arrive before 8:00 AM. Three late arrivals equal one absence. A parent's note is required after any absence, and attendance appears on every report sheet.");
addIntent('homework', 'homework|assignment|assignments|project|projects|submission|submit',
  "Homework is given daily and must be submitted the next morning. Major projects are announced two weeks early so you can plan ahead.");
addIntent('teachers', 'teacher|teachers|staff|tutor|tutors|lecturer|instructor',
  "There are 45 teaching staff members. Parents can meet teachers during the open day at the end of every month, or book an appointment through the front office.");
addIntent('subjects', 'subject|subjects|course|courses|curriculum|syllabus|offer',
  "Junior students take English, Mathematics, Basic Science, Social Studies, ICT and one language. Senior students choose from Science, Arts or Commercial streams.");
addIntent('rules', 'rule|rules|regulation|regulations|discipline|policy|conduct|punishment',
  "Key rules: be punctual, wear the correct uniform, no phones during lessons, and respect staff and fellow students. The full code of conduct is in the student handbook.");
addIntent('school_hours', 'opening time|closing time|school hours|resumption time|what time',
  "The school opens at 7:30 AM and classes begin at 8:00 AM. Closing time is 2:30 PM, and after-school clubs end by 4:30 PM.");
addIntent('location', 'where is the school|located|location|find the school|direction',
  "NOBLES Academy is located at 12 Learning Avenue, off Unity Road. It's a five-minute walk from the Central Bus Stop.");
addIntent('health', 'nurse|clinic|sick|sickness|first aid|emergency|medicine|hospital',
  "The school clinic is beside the science block and is staffed by a qualified nurse during school hours. In an emergency, parents are contacted immediately and the nearest hospital is 2 km away.");
addIntent('portal', 'portal|login|website|online|internet|e-learning',
  "The student portal lets you check results, fees and assignments online. Login details are issued by the ICT department at the start of the session.");
addIntent('lost_and_found', 'lost|found|missing|misplaced|lost item|lost and found',
  "Report lost items to the front office. All found items are kept in the Lost and Found box near the reception for two weeks before disposal.");
addIntent('goodbye', 'good night|take care|see you tomorrow|farewell',
  "Goodbye for now! Study hard and I'll be here whenever you need me.");

// ==========================================
// ENGINE HELPERS (Ported from C++)
// ==========================================
function contains(haystack, needle) {
  if (!haystack || !needle) return false;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    const leftOk = pos === 0 || !/[a-z0-9]/i.test(haystack[pos - 1]);
    const end = pos + needle.length;
    const rightOk = end >= haystack.length || !/[a-z0-9]/i.test(haystack[end]);
    if (leftOk && rightOk) return true;
    pos = haystack.indexOf(needle, pos + 1);
  }
  return false;
}

function scoreIntent(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (contains(text, kw)) score += 1 + Math.floor(kw.length / 6);
  }
  return score;
}

function getResponse(text, learned) {
  const lower = text.toLowerCase();

  // 1. Check learned answers first
  for (const item of learned) {
    const q = item.question.toLowerCase();
    if (!q) continue;
    if (contains(lower, q) || (lower.length > 3 && contains(q, lower))) {
      return item.answer;
    }
  }

  // 2. Score intents
  let bestScore = 0;
  let bestIntent = null;
  for (const intent of knowledge) {
    const s = scoreIntent(lower, intent.keywords);
    if (s > bestScore) { bestScore = s; bestIntent = intent; }
  }
  if (bestIntent) return bestIntent.response;

  // 3. Fallback
  const fallbacks = [
    "Sorry, I don't know that yet. Type 'teach' and you can teach me!",
    "Hmm, I'm not sure about that one. Type 'topics' to see what I know.",
    "I didn't quite catch that. You can type 'teach' to add a new answer.",
    "That's outside my knowledge right now. Type 'help' for my options.",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ==========================================
// API ROUTES
// ==========================================

// GET /api/topics
app.get('/api/topics', async (req, res) => {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT COUNT(*)::int AS c FROM learned_answers`;
    res.json({
      topics: knowledge.map(i => i.name),
      learnedCount: rows[0].c,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const sql = neon(process.env.DATABASE_URL);
    const learnedRows = await sql`SELECT question, answer FROM learned_answers`;
    const reply = getResponse(message, learnedRows);

    // Optional: Save to history if userId is passed
    if (userId) {
      await sql`
        INSERT INTO chat_history (user_id, user_message, bot_reply) 
        VALUES (${userId}, ${message}, ${reply})
      `;
    }

    res.json({ reply, learnedCount: learnedRows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teac
app.post('/api/teach', async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'question and answer required' });

    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO learned_answers (question, answer) 
      VALUES (${question}, ${answer})
    `;
    const rows = await sql`SELECT COUNT(*)::int AS c FROM learned_answers`;
    
    res.json({ ok: true, learnedCount: rows[0].c });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
