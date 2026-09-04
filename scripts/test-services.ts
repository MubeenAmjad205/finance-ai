import { IntentClassifier } from '../src/services/ai/intentClassifier';
import { GroupSplitService } from '../src/services/groupSplit';
import { RecurringBillService } from '../src/services/recurring';
import { escapeHtml, sanitizeCsvCell } from '../src/ui/sanitize';
import { MongoDBClient } from '../src/db/mongodb';

async function runTests() {
  console.log('🧪 Starting Service Logic Unit Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Test Intent Classifier
  console.log('1️⃣ Testing IntentClassifier:');
  assert(IntentClassifier.detect('Hello bot') === 'chat', 'Recognizes greeting as chat');
  assert(IntentClassifier.detect('How much did I spend this month?') === 'question', 'Recognizes query as question');
  assert(IntentClassifier.detect('Spent 1450 on food via JazzCash') === 'transaction', 'Recognizes expense as transaction');
  assert(IntentClassifier.detect('Meeting at 5pm tomorrow') === 'chat', 'Does NOT falsely classify "Meeting at 5pm" as transaction');
  assert(IntentClassifier.detect('Table for 2 please') === 'chat', 'Does NOT falsely classify "Table for 2" as transaction');

  // 2. Test Sanitization & CSV Neutralization
  console.log('\n2️⃣ Testing Security Sanitization:');
  assert(escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'Escapes HTML tags');
  assert(sanitizeCsvCell('=1+1') === '"\'=1+1"', 'Neutralizes CSV formula injection starting with =');
  assert(sanitizeCsvCell('+cmd|') === '"\'+cmd|"', 'Neutralizes CSV formula injection starting with +');
  assert(sanitizeCsvCell('Hello, "World"') === '"Hello, ""World"""', 'Properly escapes RFC 4180 quotes');

  // 3. Test Recurring Bills Month-End Boundary
  console.log('\n3️⃣ Testing Recurring Bills Month Boundary Wrap-around:');
  const mockBills = [
    { title: 'Rent', amount: 45000, category: 'Rent', account: 'Meezan Bank', dueDayOfMonth: 1, autoNotify: true },
    { title: 'Internet', amount: 4500, category: 'Bills', account: 'JazzCash', dueDayOfMonth: 15, autoNotify: true }
  ];
  // Simulate Day 31 of month:
  const day31 = new Date(2026, 0, 31); // Jan 31
  const dueBills = RecurringBillService.getUpcomingBillsDue(day31, mockBills);
  assert(dueBills.some(b => b.dueDayOfMonth === 1), 'Bill due on 1st of month is detected on Day 31');

  // 4. Test Group Split Remainder and Spaces
  console.log('\n4️⃣ Testing GroupSplitService:');
  const mockDb = new MongoDBClient({} as any);
  const splitResult = await GroupSplitService.processGroupSplit(
    mockDb,
    'Paid 1000 for lunch with Ali Usman Bilal - split 4 ways'
  );
  assert(splitResult.participants.length === 3, 'Extracted 3 participants + 1 payer = 4 total');
  const totalParticipantShare = splitResult.participants.reduce((sum, p) => sum + p.share, 0);
  const totalCalculated = totalParticipantShare + splitResult.perPersonShare;
  assert(totalCalculated === 1000, 'Per-person shares + remainder equal exact total of 1000 PKR without lost rupees');

  console.log(`\n================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
