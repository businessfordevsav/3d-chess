// The Learn articles: original chess guides, rendered by pages.js at /learn and /learn/<slug>.
// body is trusted HTML; <!--ad--> marks where a content ad may go (see pages.js).
export const ARTICLES = [
  {
    slug: 'chess-notation',
    level: 'Basics',
    title: 'How to Read Chess Notation',
    description: 'Algebraic notation explained: squares, piece letters, captures, checks, castling and promotion, so you can follow any game or book.',
    body: `<p>Every chess book, puzzle and broadcast writes moves the same way: in <b>algebraic notation</b>. It looks cryptic at first, but it takes about ten minutes to learn, and once you can read it you can replay any game ever recorded. Our move list in the game uses it too.</p>

<h2>Naming the squares</h2>
<p>The board is a grid. The eight columns, called <b>files</b>, are lettered <b>a</b> to <b>h</b> from White's left to White's right. The eight rows, called <b>ranks</b>, are numbered <b>1</b> to <b>8</b> starting from White's side. Each square is named by its file and then its rank, so the corner to White's left is <b>a1</b> and the opposite corner is <b>h8</b>.</p>
<p>A few landmarks help you find your way. White's king starts on <b>e1</b> and Black's on <b>e8</b>. The queens start on <b>d1</b> and <b>d8</b>. White's pawns all begin on the 2nd rank and Black's on the 7th. A useful check: the square in each player's bottom-right corner (h1 for White, a8 for Black) is always a light square.</p>

<h2>Naming the pieces</h2>
<p>Each piece except the pawn has a capital letter:</p>
<ul>
  <li><b>K</b>: king</li>
  <li><b>Q</b>: queen</li>
  <li><b>R</b>: rook</li>
  <li><b>B</b>: bishop</li>
  <li><b>N</b>: knight (K is already taken by the king)</li>
</ul>
<p>Pawns have no letter. A move is written as the piece letter followed by the square it moves to. <b>Nf3</b> means a knight moves to f3; <b>e4</b> means a pawn moves to e4. You never write where the piece came from unless it's needed to avoid confusion, because the position makes it clear.</p>

<h2>Captures, checks and mate</h2>
<ul>
  <li>An <b>x</b> means a capture: <b>Bxf7</b> is a bishop taking whatever stood on f7.</li>
  <li>Pawn captures name the file the pawn came from: <b>exd5</b> is the e-pawn capturing on d5.</li>
  <li>A <b>+</b> after a move means check: <b>Qh5+</b>.</li>
  <li>A <b>#</b> means checkmate: <b>Qxf7#</b>.</li>
</ul>

<!--ad-->
<h2>Castling, promotion and en passant</h2>
<p>Castling has its own symbols. <b>O-O</b> is castling on the king's side (short castling) and <b>O-O-O</b> is castling on the queen's side (long castling). The number of O's matches the number of squares between the king and the rook it castles with: two on the king's side, three on the queen's side.</p>
<p>Promotion is written with an equals sign and the new piece: <b>e8=Q</b> is a pawn reaching e8 and becoming a queen. If it captured on the way, it reads like <b>dxe8=Q</b>. Promoting to anything other than a queen is called <b>underpromotion</b>, and you'll occasionally see <b>=N</b> when a knight gives a vital check.</p>
<p>En passant is written as an ordinary pawn capture, to the square the capturing pawn lands on. Some books add <b>e.p.</b> after it.</p>

<h2>When two pieces could make the same move</h2>
<p>Suppose both of White's knights could jump to d2. Writing <b>Nd2</b> would be ambiguous, so you add the file of the knight that moves: <b>Nbd2</b> means the knight from the b-file. If the two pieces share a file, use the rank instead: <b>R1e2</b>. In the rare case where neither alone is enough, give the full starting square: <b>Qh4e1</b>.</p>

<h2>Reading a whole game</h2>
<p>Moves are numbered in pairs, White's move first. A short game reads like this:</p>
<p><b>1.e4 e5 2.Nf3 Nc6 3.Bb5 a6</b></p>
<p>Here White played the pawn to e4 and Black answered with the pawn to e5. On move 2 White brought a knight to f3 and Black a knight to c6. On move 3 White's bishop went to b5 and Black's a-pawn went to a6. That position is the start of the Ruy Lopez, one of the oldest openings in chess.</p>
<p>When a comment interrupts between White's move and Black's reply, Black's move is written with three dots: <b>3...a6</b>.</p>

<h2>The punctuation marks</h2>
<p>Annotators judge moves with symbols borrowed from punctuation:</p>
<ul>
  <li><b>!</b> a good move, <b>!!</b> a brilliant one</li>
  <li><b>?</b> a mistake, <b>??</b> a blunder</li>
  <li><b>!?</b> an interesting move worth trying, <b>?!</b> a dubious one</li>
</ul>
<p>The result comes at the end: <b>1-0</b> means White won, <b>0-1</b> Black won, and <b>½-½</b> a draw.</p>

<h2>PGN and FEN</h2>
<p>Computers store games in <b>PGN</b> (Portable Game Notation), which is simply algebraic notation with a header listing the players, date and result. Any chess program can open a PGN file. A single position is stored as a <b>FEN</b> string, one line that lists every piece rank by rank, whose turn it is, castling rights and a few counters. You won't write FEN by hand, but it's how puzzles and analysis boards share positions.</p>

<h2>Practise it</h2>
<p>The fastest way to learn notation is to use it. Play a game, then open the move list in the menu and read the moves back while you picture the board. Then try replaying a famous game from a book without looking at the diagrams. After a few games you'll read <b>Nxe5</b> as easily as a word.</p>`,
  },
  {
    slug: 'piece-values',
    level: 'Basics',
    title: 'Chess Piece Values: What Each Piece Is Worth',
    description: 'The point values of the chess pieces, why they work, when to break them, and how to use them to decide whether a trade is good.',
    body: `<p>Before you can tell whether a trade is good, you need to know what you're trading. Chess players use a simple point system to compare the pieces. It isn't a rule of the game, and there is no score at the end, but it's the first tool every strong player uses to judge a capture.</p>

<h2>The standard values</h2>
<ul>
  <li><b>Pawn</b>: 1 point</li>
  <li><b>Knight</b>: 3 points</li>
  <li><b>Bishop</b>: 3 points</li>
  <li><b>Rook</b>: 5 points</li>
  <li><b>Queen</b>: 9 points</li>
  <li><b>King</b>: priceless, since losing it loses the game. As a fighting piece in the endgame it's worth roughly 3 or 4.</li>
</ul>
<p>The values come from how many squares each piece controls on an open board and how useful that control is. A queen combines a rook and a bishop, so it's worth about 5 + 3, plus a little extra for doing both jobs from one square. A rook on an open file reaches up to 14 squares; a knight in the centre reaches only 8, but it can jump.</p>

<h2>Using the values to judge a trade</h2>
<p>Add up what you give and what you get. Giving a knight (3) for a rook (5) gains you 2 points; this is called <b>winning the exchange</b>, and the rook-for-minor-piece swap is simply called "the exchange". Giving a bishop (3) for three pawns (3) is roughly even. Giving a rook (5) for a knight (3) loses 2 points, so you need a good reason, such as a winning attack, to do it.</p>
<p>A practical habit: before every capture, count how many times the square is attacked and defended, and by what. Attackers outnumbering defenders isn't enough: if a pawn is guarded by another pawn and you take it with a knight, you've given 3 points for 1 however many pieces you have behind it. Capture with your least valuable piece first, and only start a sequence of captures you can finish ahead.</p>

<!--ad-->
<h2>Knight or bishop?</h2>
<p>Both are worth about 3, but they are good at different things.</p>
<ul>
  <li><b>Bishops</b> love open positions with long diagonals and pawns on both sides of the board. They can stop a pawn from far away.</li>
  <li><b>Knights</b> are better in closed positions, where pawns block the diagonals, and on <b>outposts</b>: squares in the enemy half that no enemy pawn can attack.</li>
</ul>
<p>Two bishops together, called <b>the bishop pair</b>, are usually worth about half a pawn more than a bishop and knight or two knights. Between them they cover every square, and in an open position they can be overwhelming.</p>

<h2>When the numbers lie</h2>
<p>The values describe pieces on an average board. Real positions are rarely average, and these factors can change a piece's worth:</p>
<ul>
  <li><b>Activity.</b> A rook stuck in the corner behind its own pawns does less than a knight in the centre. A "bad" bishop hemmed in by its own pawns on its own colour can be worth less than a pawn.</li>
  <li><b>King safety.</b> Giving up a rook to strip away the pawns in front of the enemy king can win the game outright. Material only matters if the game lasts long enough to use it.</li>
  <li><b>Passed pawns.</b> A pawn on the seventh rank, one step from becoming a queen, may be worth as much as a rook.</li>
  <li><b>The stage of the game.</b> Rooks grow stronger as the board empties. Knights grow weaker in endgames with pawns on both wings because they're slow to switch sides.</li>
  <li><b>Combinations of pieces.</b> Two rooks are usually a little better than a queen in the endgame, while a queen is often better than a rook and a minor piece when there are targets to attack.</li>
</ul>

<h2>Common trades and what they mean</h2>
<ul>
  <li><b>Knight for bishop</b>: even on paper. Judge it by whether the position will open or stay closed.</li>
  <li><b>Two minor pieces for a rook and a pawn</b>: in the middlegame, the two pieces are usually better, because they work together and attack more.</li>
  <li><b>Queen for two rooks</b>: roughly even, slightly favouring the rooks if they can work together.</li>
  <li><b>Queen for rook and minor piece</b>: roughly even; the side with more pieces often has the easier game to play.</li>
</ul>

<h2>Material in the endgame</h2>
<p>Being ahead in material matters most when the pieces come off. A simple rule: <b>when you're ahead, trade pieces, not pawns</b>. Each trade makes your extra material count for more, and keeping the pawns keeps your winning chances. When you're behind, do the opposite: avoid trades and keep the position complicated.</p>
<p>Some endgames are draws despite extra material. A lone knight or bishop can't checkmate, and a rook against a bishop is usually a draw with good defence. Knowing these exceptions saves you from trading into a dead draw.</p>

<h2>Practise it</h2>
<p>Play a few games against the computer at an easy level and, before every capture, say the count out loud: "I give 3, I get 5." It feels slow at first. After a week it becomes automatic, and you'll stop losing pieces to trades that only looked good.</p>`,
  },
  {
    slug: 'opening-principles',
    level: 'Openings',
    title: 'Chess Opening Principles for Beginners',
    description: 'Control the centre, develop your pieces, castle early and avoid common opening traps: the principles that matter more than memorising moves.',
    body: `<p>Most beginners think learning openings means memorising long lines. It doesn't. Strong players follow a handful of principles in the first ten or so moves, and those principles will carry you through openings you've never seen. Memorise less; understand more.</p>

<h2>1. Fight for the centre</h2>
<p>The four squares in the middle of the board, <b>d4, e4, d5 and e5</b>, are the most important on the board. A piece in the centre reaches more squares and can switch quickly to either side. A knight on e5 attacks eight squares; on h5 it attacks only four.</p>
<p>That's why the most popular first moves are <b>1.e4</b> and <b>1.d4</b>: each puts a pawn in the centre and opens a line for a bishop and the queen. You can also control the centre from a distance, with knights on f3 and c3 or a bishop on a long diagonal. Either way, every early move should help answer the question: who controls the middle?</p>

<h2>2. Develop your pieces</h2>
<p><b>Development</b> means moving your pieces off their starting squares to places where they do something. In the opening, a move that develops a new piece is usually better than one that moves a piece twice.</p>
<ul>
  <li><b>Knights before bishops</b>, as a rule of thumb. The best squares for knights (f3, c3, f6, c6) are clear early, while the best square for a bishop often depends on what your opponent does.</li>
  <li><b>Don't move the same piece twice</b> without a reason, such as capturing something or escaping an attack.</li>
  <li><b>Don't bring the queen out too early.</b> She can be chased around by knights and bishops, and every time she moves you lose a tempo while your opponent develops with gain of time.</li>
</ul>
<p>A useful count: after about ten moves, how many of your minor pieces (knights and bishops) are developed? If the answer is four and your opponent's is two, you're probably better, even with equal material.</p>

<!--ad-->
<h2>3. Castle early</h2>
<p>In the centre, your king is in the line of fire once the central pawns trade off and the files open. <b>Castling</b> tucks the king behind a wall of pawns and brings a rook towards the middle in a single move. Most games between good players see both sides castle within the first ten or twelve moves.</p>
<p>Short castling (O-O) is quicker, because only the knight and bishop have to move out of the way. Long castling (O-O-O) needs the queen to move too, but puts the rook straight onto the d-file. After castling, try not to push the pawns in front of your king without a good reason: each pawn move leaves a hole the enemy pieces can use.</p>

<h2>4. Connect your rooks</h2>
<p>When the knights, bishops and queen have moved and the king has castled, your two rooks see each other along the back rank. That's called <b>connecting the rooks</b>, and it's a good sign that the opening is over. Next, put the rooks on open or half-open files, where they can pressure the enemy position.</p>

<h2>5. Don't grab pawns at any cost</h2>
<p>A pawn is worth a point, but three tempi of development can be worth more. The classic example is taking the b2 pawn with your queen early in the game: it often works, but just as often the queen gets trapped or the time spent lets your opponent start an attack. Before grabbing material in the opening, ask: what will my opponent do with the time I'm spending?</p>

<h2>Traps to know</h2>
<p>Two quick checkmates catch thousands of beginners every day.</p>
<ul>
  <li><b>Scholar's mate</b>: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#. The f7 square is defended only by Black's king at the start, which makes it a target. The simple defence after 3.Qh5 is 3...g6, or 3...Qe7, which also guards f7. Then White's queen is out early and can be chased.</li>
  <li><b>Fool's mate</b>: 1.f3 e5 2.g4?? Qh4#. Weakening the pawns in front of your own king this early opens a diagonal straight to it.</li>
</ul>
<p>Both traps teach the same lesson: f7 and f2 are weak at the start, and pushing the f- and g-pawns early exposes your king.</p>

<h2>Putting it together</h2>
<p>Here's a sample opening that follows every principle: <b>1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O</b>. Both sides have a pawn in the centre, both knights and the king's bishops are out, and both kings are safe. From here, the remaining pieces come out, the rooks find files, and the real fight begins. You can read more about this opening in our guide to <a href="/learn/italian-game">the Italian Game</a>.</p>

<h2>Practise it</h2>
<p>Play a game against the computer and, for each of your first ten moves, ask three questions: does it fight for the centre, does it develop a piece, and does it bring my king closer to safety? If a move does none of these, look for a better one.</p>`,
  },
  {
    slug: 'italian-game',
    level: 'Openings',
    title: 'The Italian Game: A Beginner-Friendly Opening for White',
    description: 'How to play the Italian Game with 1.e4 e5 2.Nf3 Nc6 3.Bc4: the main ideas, the Giuoco Piano, the Two Knights Defence and the traps to avoid.',
    body: `<p>The <b>Italian Game</b> is one of the oldest openings in chess, analysed by Italian players in the 1500s, and it's still played at every level today, from first-time players to world championship matches. It follows the opening principles naturally, leads to open positions where tactics matter, and teaches you how to attack the weak f7 square. That makes it an ideal first opening.</p>

<h2>The starting moves</h2>
<p><b>1.e4 e5 2.Nf3 Nc6 3.Bc4</b></p>
<p>White puts a pawn in the centre, develops the knight with an attack on e5, and places the bishop on its most aggressive diagonal, aiming at <b>f7</b>. At the start of the game, f7 is guarded only by Black's king, so it's the most natural target on the board.</p>
<p>Black now has two main replies: <b>3...Bc5</b>, the Giuoco Piano, and <b>3...Nf6</b>, the Two Knights Defence.</p>

<h2>The Giuoco Piano: 3...Bc5</h2>
<p>"Giuoco Piano" is Italian for "quiet game". Black copies White, putting the bishop on the diagonal towards f2. White now chooses between two plans.</p>
<h3>The quiet plan: 4.c3 and 5.d3</h3>
<p>White prepares d4 with c3, but plays d3 first and builds slowly: castle, put a rook on e1, bring the queen's knight round via d2 and f1 to g3, and push a4 to gain space on the queenside. This is how most modern grandmasters play it. The position stays balanced, but White has a small, lasting initiative and very little risk.</p>
<h3>The sharp plan: 4.c3 Nf6 5.d4</h3>
<p>White strikes in the centre at once. After 5...exd4 6.cxd4 Bb4+, Black gains time by attacking the king, and the play becomes very tactical. It's fun, but you need to know the lines; as a beginner, the quiet plan gives you more natural positions to learn from.</p>

<!--ad-->
<h2>The Two Knights Defence: 3...Nf6</h2>
<p>Black ignores the bishop and counterattacks White's e4 pawn. This is the sharper choice, and White has a famous aggressive try: <b>4.Ng5</b>, attacking f7 with knight and bishop together.</p>
<p>The correct defence is <b>4...d5</b>, blocking the bishop. After <b>5.exd5</b>, Black's best and most popular move is <b>5...Na5</b>, chasing the bishop away and giving up a pawn for quick development. Black gets good play for the pawn.</p>
<p>The natural-looking <b>5...Nxd5?!</b> is risky. White can play <b>6.Nxf7!?</b>, sacrificing a knight: after 6...Kxf7 7.Qf3+ Ke6 Black's king is dragged into the centre and has to defend very accurately. This is the famous <b>Fried Liver Attack</b>, and it wins a lot of quick games against unprepared opponents.</p>
<p>If you'd rather not allow all that as Black, choose 3...Bc5 instead. If you'd rather not go into it as White, play the quiet <b>4.d3</b> and develop normally.</p>

<h2>Key ideas for White</h2>
<ul>
  <li><b>Pressure on f7.</b> The bishop on c4 and a knight on g5 (or the queen on h5 or f3) can combine against it. Watch for tactics there all game.</li>
  <li><b>The d4 break.</b> Preparing d4 with c3 is White's main central plan. When it comes, the centre opens and White's better-developed pieces come to life.</li>
  <li><b>Keep the bishop.</b> If Black plays ...Na5 to trade the c4 bishop, it's often worth retreating it to b3, where it still aims at f7.</li>
  <li><b>The kingside knight manoeuvre.</b> In the slow lines, Nb1-d2-f1-g3 is a standard regrouping that brings a knight towards the black king.</li>
</ul>

<h2>Key ideas for Black</h2>
<ul>
  <li><b>Challenge the bishop.</b> Moves like ...d6, ...Be6 or ...Na5 reduce its pressure.</li>
  <li><b>Play ...d5 when it works.</b> If Black can safely push the d-pawn two squares, the opening is a success: the c4 bishop is blunted and Black gets central space.</li>
  <li><b>Watch h6 and g4 ideas.</b> When White plays Bg5 to pin your knight, ...h6 asks the question.</li>
</ul>

<h2>A trap to avoid</h2>
<p>After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4!? (a cheeky move sometimes called the Blackburne Shilling Gambit), White's natural 4.Nxe5? walks into 4...Qg5!, attacking both the knight and g2. If White greedily plays 5.Nxf7?? Qxg2 6.Rf1 Qxe4+ 7.Be2 Nf3#, it's mate. The safe answer to 3...Nd4 is simply to castle or play 4.Nxd4 exd4 5.O-O with a pleasant position.</p>

<h2>Practise it</h2>
<p>Play the Italian in a few games against the computer on Easy or Medium. Don't try to win quickly; aim for a position with your pieces developed, your king castled, and a well-prepared d4 push. Then look at the move list afterwards and see where the f7 square mattered.</p>`,
  },
  {
    slug: 'sicilian-defence',
    level: 'Openings',
    title: 'The Sicilian Defence: Fighting Back Against 1.e4',
    description: 'Why 1...c5 is the most popular reply to 1.e4, the main ideas behind the Open Sicilian, the Najdorf and the Dragon, and how to meet the Alapin.',
    body: `<p>When White opens <b>1.e4</b>, the most popular reply among strong players is <b>1...c5</b>, the <b>Sicilian Defence</b>. It's been the choice of world champions from Fischer to Kasparov because it gives Black an unbalanced position and real winning chances, not just equality.</p>

<h2>Why 1...c5?</h2>
<p>Instead of copying White with 1...e5, Black controls the d4 square from the side with a flank pawn. The idea is a trade: if White plays d4 and Black captures with ...cxd4, Black swaps a side pawn for one of White's central pawns. Black then has two central pawns (d and e) against White's one, and a half-open c-file to use for rooks and the queen.</p>
<p>White gets something in return: faster development, more space, and attacking chances against Black's king. The result is an <b>asymmetrical</b> position in which both sides have their own plans, which is exactly why it's so popular when you need to win.</p>

<h2>The Open Sicilian</h2>
<p>White's most ambitious answer is to open the centre at once:</p>
<p><b>1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3</b></p>
<p>This is the starting point of the main lines. White has a lead in development and a knight in the centre; Black has the extra central pawn and the c-file. Black's fifth move decides which variation you're in.</p>

<h3>The Najdorf: 5...a6</h3>
<p>The most famous Sicilian of all. The little move ...a6 stops White's pieces from using b5 and prepares ...e5 or ...b5 to gain space on the queenside. It looks slow, but it keeps Black's options open. The Najdorf is deep and heavily analysed, so it rewards study, but its ideas are simple to start with: control d5, expand on the queenside, and counterattack on the c-file.</p>

<h3>The Dragon: 5...g6</h3>
<p>Black puts the bishop on g7, where it aims down the long diagonal at White's queenside. The pawn chain d6, e7, f7, g6, h7 was thought to look like a dragon's back, which gave the line its name. White often answers with the <b>Yugoslav Attack</b>: Be3, f3, Qd2, castling long, and then pushing h4 and h5 to open the h-file against Black's king. Black castles short and attacks on the other side. Both sides race, and the first attack to land usually wins.</p>

<!--ad-->
<h3>Other second moves for Black</h3>
<ul>
  <li><b>2...Nc6</b> develops a knight first, leading to lines like the Classical Sicilian or the Sveshnikov (with an early ...e5).</li>
  <li><b>2...e6</b> keeps the position flexible, leading to the Taimanov, Kan or Scheveningen systems, where Black builds a compact "hedgehog" of pawns on the sixth rank.</li>
</ul>

<h2>Anti-Sicilians: when White avoids the main lines</h2>
<p>Many club players as White don't want to learn the Open Sicilian theory, so you'll often meet these instead:</p>
<ul>
  <li><b>The Alapin, 2.c3.</b> White prepares d4 so that after ...cxd4 they can recapture with the c-pawn and keep two central pawns. Black's simplest answers are <b>2...d5</b>, hitting the centre at once, or <b>2...Nf6</b>, attacking e4.</li>
  <li><b>The Closed Sicilian, 2.Nc3 followed by g3 and Bg2.</b> A slower setup aiming for a kingside attack with f4 later. Black often plays ...g6, ...Bg7 and expands on the queenside.</li>
  <li><b>The Grand Prix Attack, 2.Nc3 and 3.f4.</b> An aggressive kingside setup. Black should develop quickly and look to strike in the centre with ...d5.</li>
  <li><b>The Smith-Morra Gambit, 2.d4 cxd4 3.c3.</b> White gives a pawn for rapid development. Black can accept and develop carefully, or decline with 3...Nf6 or 3...d5.</li>
</ul>

<h2>Common plans for Black</h2>
<ul>
  <li><b>Use the c-file.</b> A rook on c8 and the queen on c7 put pressure on c2 and White's queenside, especially when White has castled long.</li>
  <li><b>The ...d5 break.</b> When Black can play ...d5 safely, the centre opens on Black's terms and the opening is usually a success.</li>
  <li><b>The exchange sacrifice on c3.</b> A classic Sicilian idea: giving a rook for White's knight on c3 to wreck the pawns in front of White's king or win the e4 pawn.</li>
</ul>

<h2>Is it right for you?</h2>
<p>The Sicilian suits players who like complicated, double-edged positions and are willing to learn some theory. If you're just starting out, 1...e5 teaches the basics more gently. Once you know the opening principles and are comfortable with tactics, the Sicilian is a great way to play for a win with Black.</p>

<h2>Practise it</h2>
<p>Set the computer to Medium and play 1...c5 against 1.e4. Don't worry about names; focus on the plans. After each game, check the move list: did you get your ...d5 or ...b5 in? Did your rook reach the c-file?</p>`,
  },
  {
    slug: 'queens-gambit',
    level: 'Openings',
    title: "The Queen's Gambit: Accepted, Declined and the Slav",
    description: "How the Queen's Gambit works after 1.d4 d5 2.c4, why it isn't a real gambit, and the main ideas of the Accepted, Declined and Slav defences.",
    body: `<p>The <b>Queen's Gambit</b> starts with <b>1.d4 d5 2.c4</b>, and it's been a mainstay of top-level chess for over a century. White offers a pawn on the side to lure Black's d-pawn away from the centre. Unlike most gambits, though, White usually gets the pawn back, so it's really a fight for the centre rather than a sacrifice.</p>

<h2>The idea behind 2.c4</h2>
<p>After 1.d4 d5, both sides have a pawn in the centre. White would like to play e4 too, but Black's d5 pawn prevents it. The move 2.c4 attacks d5 from the side. If Black captures with 2...dxc4, the d5 pawn is gone and White can build a big centre with e4. If Black keeps the pawn on d5, White keeps pressuring it.</p>
<p>Black has three main answers: take the pawn (the Accepted), support d5 with e6 (the Declined), or support it with c6 (the Slav).</p>

<h2>The Queen's Gambit Accepted: 2...dxc4</h2>
<p>Black takes the pawn but doesn't try to keep it. The point is to use the time White spends winning it back to develop and strike at the centre with ...c5 or ...e5.</p>
<p>A typical line: <b>1.d4 d5 2.c4 dxc4 3.Nf3 Nf6 4.e3 e6 5.Bxc4 c5 6.O-O a6</b>. White has regained the pawn and has a nice centre; Black has free development, and after an exchange on d4 White is often left with an isolated d-pawn for Black to aim at.</p>
<p>Trying to hold the extra pawn is a classic beginner's mistake. After <b>3.e3 b5? 4.a4 c6 5.axb5 cxb5?? 6.Qf3</b>, White's queen attacks the undefended rook on a8 along the long diagonal, and Black loses material.</p>

<!--ad-->
<h2>The Queen's Gambit Declined: 2...e6</h2>
<p>Black simply defends d5 with the e-pawn. It's one of the most solid defences in chess, and its main drawback is clear: the pawn on e6 blocks Black's light-squared bishop on c8. A big part of Black's play is finding a job for that bishop, usually by preparing ...c5 or ...e5 later, or developing it to b7 after ...b6.</p>
<p>A typical position arises after <b>3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3</b>. White pins Black's knight and builds slowly; Black stays compact and looks for the right moment to free the position.</p>
<h3>The Elephant Trap</h3>
<p>A famous trap in the Declined catches White players who grab material carelessly: <b>1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7 5.cxd5 exd5 6.Nxd5?</b> The knight on f6 seems pinned to the queen, but <b>6...Nxd5!</b> breaks the pin. If <b>7.Bxd8</b>, then <b>7...Bb4+</b> forces <b>8.Qd2 Bxd2+ 9.Kxd2 Kxd8</b>, and Black is a piece up. The lesson: a pin against the queen isn't absolute, because the queen can be given up for something bigger.</p>
<h3>The minority attack</h3>
<p>One of the most instructive plans in all of chess comes from the Exchange Variation of the Declined, where White plays cxd5 and Black recaptures exd5. White then advances the b-pawn to b5, attacking Black's c6 pawn with fewer pawns than Black has on that side (the "minority"). The aim is to leave Black with a weak, backward pawn on c6 or an isolated pawn on d5 to attack for the rest of the game.</p>

<h2>The Slav Defence: 2...c6</h2>
<p>Black defends d5 with the c-pawn instead. The big advantage over the Declined is that the c8 bishop isn't blocked: it can come out to f5 or g4 before Black plays ...e6. The Slav is just as solid and has been a favourite of many world champions.</p>
<p>A main line runs <b>3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5</b>. Black takes on c4 only after White has committed, and gets the bishop out actively. White plays a4 to stop ...b5, which would otherwise hold the extra pawn.</p>

<h2>Common themes</h2>
<ul>
  <li><b>The isolated queen's pawn.</b> Many lines lead to a lone pawn on d4 or d5 with no pawns beside it. Its owner gets active pieces and attacking chances; the opponent blockades it and aims for the endgame, where it becomes a weakness.</li>
  <li><b>Pressure on the c-file.</b> Once the c-pawns are exchanged, rooks on c1 or c8 become important.</li>
  <li><b>The e4 (or e5) break.</b> Freeing the centre with a pawn break is the main plan for whichever side is more cramped.</li>
</ul>

<h2>Practise it</h2>
<p>Try 1.d4 and 2.c4 against the computer, and switch between the three defences when you play Black. Pay attention to the light-squared bishop: in each game, notice where it ended up and whether it was doing anything.</p>`,
  },
  {
    slug: 'forks-pins-skewers',
    level: 'Tactics',
    title: 'Chess Tactics: Forks, Pins and Skewers',
    description: 'The three most common chess tactics explained with examples: how to spot forks, pins and skewers in your games and how to avoid falling for them.',
    body: `<p>Most games between club players are decided by tactics: short, forcing sequences that win material or give mate. Three patterns account for a huge share of them: the <b>fork</b>, the <b>pin</b> and the <b>skewer</b>. Learn to spot these and you'll win more games and lose fewer pieces.</p>

<h2>The fork</h2>
<p>A <b>fork</b> is a single piece attacking two or more enemy pieces at once. Your opponent can only save one, so you win the other.</p>
<h3>Knight forks</h3>
<p>The knight is the master forker. Because it moves in an L-shape, it can attack pieces that can't attack it back, and its attacks are hard to see coming. The most dangerous kind is the <b>royal fork</b>: a knight checking the king while also attacking the queen. The king has to move, and the queen falls.</p>
<p>Classic patterns: a white knight on <b>e7</b> forks a black king on g8 and a queen on c8 or c6, and a knight on <b>f7</b> forks a queen on d8 and a rook on h8. Watch those squares whenever enemy knights are near your king.</p>
<h3>Pawn forks</h3>
<p>Pawns fork too, and because a pawn is worth so little, a pawn fork almost always wins material. A pawn on e4 that pushes to e5 attacking knights on d6 and f6 wins one of them for a pawn. In the opening, a well-known example is <b>1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Nc3 Nxe4!? 5.Nxe4 d5!</b>, a "fork trick" where Black regains the piece by forking the bishop and the knight with the pawn.</p>
<h3>Queen forks</h3>
<p>The queen can fork in eight directions at once. Queen forks often target the king and an undefended piece: a check that also hits a loose rook in the corner, for example.</p>

<!--ad-->
<h2>The pin</h2>
<p>A <b>pin</b> attacks a piece that can't move, or shouldn't, because a more valuable piece stands behind it on the same line. Only pieces that move in straight lines can pin: bishops, rooks and queens.</p>
<ul>
  <li>An <b>absolute pin</b> is against the king. The pinned piece is not allowed to move at all, because that would expose the king to check. A bishop on b5 pinning a knight on c6 to a king on e8 is a common example.</li>
  <li>A <b>relative pin</b> is against something else, often the queen. The pinned piece may move, but it costs you. A bishop on g5 pinning a knight on f6 to a queen on d8 is the most famous relative pin in chess.</li>
</ul>
<p>Once a piece is pinned, pile up on it. A pinned piece can't defend properly, so attack it again, ideally with a pawn. In the position with Bg5 pinning a knight on f6, moves like e5 or Nd5 often win the pinned knight because it cannot escape.</p>
<h3>Breaking a pin</h3>
<p>If you're the one who is pinned, you have options: move the piece behind out of the line (for example, move the queen off d8), put another piece in between, or attack the pinning piece, often with a pawn (...h6 against a bishop on g5). Sometimes you can ignore a relative pin entirely, as in the <a href="/learn/queens-gambit">Elephant Trap</a>, where the "pinned" knight captures anyway.</p>

<h2>The skewer</h2>
<p>A <b>skewer</b> is a pin turned inside out. The more valuable piece stands in front; when it moves out of the attack, you capture the piece behind it.</p>
<p>The most common skewer is a check along a line: a rook checks the king along a rank, the king steps aside, and the rook takes the queen or rook standing behind it. Skewers are especially common in endgames, where kings and rooks are out in the open. A classic example is a rook endgame where one side is about to promote a pawn: as soon as the new queen appears, a rook check on the same file or rank skewers the king and wins the queen.</p>

<h2>How to spot them</h2>
<p>Tactics don't appear out of nowhere. They need targets. Look for these warning signs, in your opponent's position and in your own:</p>
<ul>
  <li><b>Undefended pieces.</b> A loose piece is the first ingredient of almost every fork.</li>
  <li><b>Pieces on the same line.</b> King and queen on the same file, rank or diagonal are begging for a pin or skewer.</li>
  <li><b>Pieces a knight's jump apart.</b> If two of your pieces can be attacked from the same square, ask whether an enemy knight can reach it.</li>
  <li><b>An exposed king.</b> Checks are the most forcing moves, so a king without cover makes forks and skewers much easier.</li>
</ul>

<h2>A thinking habit</h2>
<p>Before each move, look at every <b>check</b>, every <b>capture</b> and every <b>threat</b> you can make, and then the same for your opponent. This short routine, often called "checks, captures, threats", catches the large majority of tactics on both sides of the board.</p>

<h2>Practise it</h2>
<p>Play the computer on Easy and hunt for one fork, pin or skewer per game. Then raise the level. Daily tactics puzzles from any source will also build your pattern recognition quickly; ten puzzles a day does more than an hour once a week.</p>`,
  },
  {
    slug: 'discovered-attacks',
    level: 'Tactics',
    title: 'Discovered Attacks and Double Check',
    description: 'How discovered attacks, discovered checks and double checks work, why they are so powerful, and how to set them up and defend against them.',
    body: `<p>A <b>discovered attack</b> happens when one piece moves out of the way and reveals an attack by another piece standing behind it. It's one of the most powerful tactics in chess because it creates two threats with one move: whatever the moving piece does, plus the attack it uncovers.</p>

<h2>How it works</h2>
<p>You need two pieces on the same line: a long-range piece behind (a bishop, rook or queen) and a front piece blocking it. When the front piece moves, the line opens.</p>
<p>Imagine a white rook on e1, a white knight on e4 and a black queen on e8. The knight blocks the rook's file. If the knight jumps to f5, attacking a black rook on d6, Black faces two threats: the knight's, and the rook's attack on the queen. Black usually can't answer both.</p>

<h2>Discovered check</h2>
<p>A <b>discovered check</b> is a discovered attack where the uncovered piece gives check. It's even stronger, because your opponent must deal with the check first, and the piece that moved is free to do almost anything: capture the queen, grab a rook, or go anywhere it likes, even to a square where it can be taken, since the check must be answered first.</p>
<p>Think of a rook on the same file as the enemy king with your own bishop in between. Every time the bishop moves, it gives check. The bishop can take something on each move while the rook keeps checking: this repeating pattern is called a <b>windmill</b>, and it can strip an entire position of its pieces.</p>

<!--ad-->
<h2>Double check</h2>
<p>A <b>double check</b> happens when the moving piece gives check too, so the king is attacked by two pieces at once. This is the most forcing move in chess. You can't block two checks with one piece, and you can't capture two checkers with one move, so the <b>king must move</b>. If it has no safe square, it's checkmate, even if every other piece of the defender is ready to help.</p>
<p>A well-known trap in the Petrov Defence shows how forcing moves overwhelm a defender. After <b>1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Bg5?? Nxe4! 7.Bxd8?? Bxf2+ 8.Ke2 Bg4#</b>, Black gives up the queen and mates with two bishops and a knight. It isn't a double check, but it shows the same principle that makes discovered attacks so dangerous: when the king is forced to respond, the defender has no time to save the rest.</p>
<p>A cleaner example of double check: a white rook on e1 and a black king on e8, with a white knight on e4 between them. If the knight jumps to d6 or f6, it gives check, and so does the rook down the newly opened e-file. Two checks at once: the king must move, and next turn the knight is free to take whatever it attacks.</p>

<h2>Setting one up</h2>
<ul>
  <li><b>Line up your long-range piece with a target.</b> Put a rook on the same file as the enemy king or queen, or a bishop on the same diagonal, even when your own piece is in the way.</li>
  <li><b>Make the front piece useful.</b> The piece that moves should have a strong move available: a capture, a check, or an attack on something valuable.</li>
  <li><b>Look at the king's file and diagonals.</b> Castled kings on g1 or g8 often sit on the same diagonal as a bishop (a7-g1 or a2-g8). If one of your pieces is blocking that diagonal, ask what happens if it moves with tempo.</li>
</ul>

<h2>Defending against them</h2>
<p>Discovered attacks are hard to defend once they're on the board, so the trick is to avoid the setup:</p>
<ul>
  <li><b>Don't leave your king and queen on lines that enemy bishops, rooks or queens control</b>, even if a piece is currently in the way. "In the way" is temporary.</li>
  <li><b>Watch enemy pieces that block their own long-range pieces.</b> If your opponent has a knight in front of a rook aimed at your queen, that knight is a loaded gun. Move the target or challenge the rook.</li>
  <li><b>When in doubt, step off the line.</b> Moving your king one square, from g8 to h8 for example, often removes the whole danger.</li>
</ul>

<h2>Discovered attacks in the opening</h2>
<p>They show up early more often than you'd expect. A common pattern in 1.e4 e5 openings: after the e-file opens, a knight on e5 or e4 stands in front of a rook or queen on the e-file, with the enemy king still uncastled on e8 or e1. Any knight move can then reveal a check. This is one more reason to <a href="/learn/opening-principles">castle early</a>.</p>

<h2>Practise it</h2>
<p>In your next few games, whenever two of your pieces stand on the same line, stop and ask: what would happen if the front piece moved? And do the same check for your opponent. Spotting the setup a move before it fires is what separates players who use discovered attacks from those who fall for them.</p>`,
  },
  {
    slug: 'checkmate-patterns',
    level: 'Tactics',
    title: 'Checkmate Patterns Every Player Should Know',
    description: 'Back-rank mate, smothered mate, Anastasia’s mate, the Arabian mate and more: the classic checkmate patterns, how they arise and how to avoid them.',
    body: `<p>Checkmates look different every time, but underneath most of them are a small number of recurring <b>patterns</b>. Strong players don't calculate every mate from scratch; they recognise the shape and then check that it works. Learning these patterns is one of the fastest ways to start finishing games.</p>

<h2>Back-rank mate</h2>
<p>The most common checkmate in practical play. A king has castled and sits behind its three unmoved pawns, say on g8 with pawns on f7, g7 and h7. A rook or queen lands on the back rank with check, nothing can block, and the king's own pawns stop it from escaping. Mate.</p>
<p>It happens to players of every level because the castled position looks so safe. The cure is cheap: at a quiet moment, make <b>luft</b> ("air" in German) by pushing h3 or g3 (h6 or g6 for Black), giving the king an escape square. Also watch your back rank whenever your rooks leave it. Many games are lost by a rook that wandered off to grab a pawn, leaving the back rank empty.</p>
<p>The back-rank threat is also a weapon. If your opponent's back rank is weak, their pieces become tied to defending it, which often lets you win material elsewhere.</p>

<h2>Smothered mate</h2>
<p>A king surrounded by its own pieces, with no squares to move to, is mated by a single knight check, since a knight check can't be blocked. The most famous version, sometimes called <b>Philidor's legacy</b>, goes like this. The black king is on h8 with a rook on f8 and pawns on g7 and h7; White has a queen on c4, on the a2-g8 diagonal, and a knight on g5:</p>
<ol>
  <li><b>Nf7+</b>: the knight checks, and the king's only square is <b>Kg8</b>.</li>
  <li><b>Nh6+</b>: a double check, from the knight and from the queen, whose diagonal the knight has just uncovered. The king must go back: <b>Kh8</b>.</li>
  <li><b>Qg8+!!</b>: the queen sacrifices herself on g8. The king can't take because the knight on h6 guards g8, so the rook must: <b>Rxg8</b>.</li>
  <li><b>Nf7#</b>: the king on h8 is boxed in by its own rook on g8 and pawns on g7 and h7.</li>
</ol>
<p>Once you've seen it, you'll recognise the ingredients: a king in the corner, a crowded position around it, and a knight that can reach f7 or g6.</p>

<!--ad-->
<h2>Anastasia's mate</h2>
<p>A knight and a rook combine against a king on the edge. The knight on e7 covers g8 and g6; the rook delivers mate on the h-file against a king on h7 or h8, with the king's own pawn on g7 blocking the last escape square. It often arises after a rook or queen sacrifice opens the h-file.</p>

<h2>The Arabian mate</h2>
<p>One of the oldest known patterns. A rook and a knight work together against a king in the corner: knight on f6, rook on h7, king on h8. The rook gives check and is protected by the knight, which also covers g8. It's worth remembering because it's the standard way a rook and knight mate when the king is trapped in a corner.</p>

<h2>The ladder (or lawnmower) mate</h2>
<p>Two heavy pieces, two rooks or a rook and queen, take turns checking the king along ranks or files, pushing it one row at a time to the edge, where the final check is mate. It's the easiest mate to learn with lots of material and a great one to practise first, because it teaches pieces to cooperate. We cover it in detail in <a href="/learn/basic-checkmates">basic checkmates</a>.</p>

<h2>Bishop and queen on the long diagonal</h2>
<p>A queen backed up by a bishop can mate on a square next to the king. A common example: White's bishop on b2, aiming at g7 along the long diagonal, and the queen landing on g7 with check, protected by the bishop. If the black king is on g8 with no escape squares, it's mate. Weakening the pawns in front of your king, especially pushing g6 without a bishop on g7, invites this pattern.</p>

<h2>Damiano's mate and the h-file</h2>
<p>When an h-file opens in front of a castled king, a queen on h7 or h8 supported by a pawn on g6 or a bishop often gives mate. Many attacks against the castled king aim to open the h-file by pushing the h-pawn or sacrificing on h7 or h6. The famous <b>Greek gift</b> sacrifice, Bxh7+ followed by Ng5+ and Qh5, is built on exactly this idea.</p>

<h2>How to use patterns in your games</h2>
<ul>
  <li><b>Look at the enemy king's escape squares.</b> Count them. A king with none needs only one well-placed check.</li>
  <li><b>Look for forcing moves first.</b> Checks, then captures, then threats. Mating patterns almost always start with a check.</li>
  <li><b>Don't fear sacrifices.</b> Many patterns, like the smothered mate, need you to give up material to clear the way. If the result is checkmate, the material doesn't matter.</li>
  <li><b>Defend early.</b> When you see one of these shapes forming around your own king, fix it before it becomes forced: make luft, bring a defender, or trade the attacking piece.</li>
</ul>

<h2>Practise it</h2>
<p>Pick one pattern per week and look for it in every game you play. Mate-in-one and mate-in-two puzzles are the quickest way to build recognition; after a few hundred, the patterns start to jump off the board.</p>`,
  },
  {
    slug: 'basic-checkmates',
    level: 'Endgames',
    title: 'Basic Checkmates: King and Queen, King and Rook',
    description: 'Step-by-step methods to checkmate a lone king with a queen, with a rook, and with two rooks, plus how to avoid stalemate when you are winning.',
    body: `<p>Every chess player needs to know how to finish the job. If you win your opponent's pieces but can't deliver mate, you'll draw won games, either by stalemate or by the fifty-move rule. These three basic mates come up all the time, and each one follows a simple method you can learn in an afternoon.</p>

<h2>Two rooks: the ladder mate</h2>
<p>Start here: it's the easiest. Two rooks can mate without any help from your king.</p>
<ol>
  <li>Use one rook to cut the enemy king off along a rank or file. For example, a rook on the 4th rank keeps a black king on ranks 5 to 8.</li>
  <li>Give check with the other rook on the next rank up, pushing the king back.</li>
  <li>Keep alternating: the rook that's behind leapfrogs to the rank in front of the other one and gives check. The king is pushed back one rank each time.</li>
  <li>When the king reaches the edge, the next check along the edge is mate, since the other rook covers the rank in front.</li>
</ol>
<p>One catch: if the king comes close to the rook that's about to move, move that rook far away along its rank, to the other side of the board, before continuing. Rooks are strongest at a distance.</p>

<h2>King and queen against king</h2>
<p>The queen can't mate alone; the king has to help. The method has two stages.</p>
<h3>Stage one: shrink the box</h3>
<p>Place your queen a knight's move away from the enemy king. This restricts it to a smaller rectangle of the board. Then keep moving the queen so it stays a knight's move away as the king moves, and the box gets smaller each time. You don't need to give check; checks often let the king escape.</p>
<h3>Stage two: bring the king</h3>
<p>Once the enemy king is stuck on the edge, bring your own king up to stand two squares in front of it (for example your king on e6 against a king on e8). Then the queen gives mate on the edge, protected by your king or simply covering the whole row: Qe7 mate or a queen check along the 8th rank.</p>
<h3>Beware of stalemate</h3>
<p>This is the big danger. If the enemy king has <b>no legal move and isn't in check</b>, it's a draw. The classic accident is a king in the corner, say on h8, with your queen on g6 or f7. The king can't move anywhere, and it isn't attacked: stalemate. Before every queen move near a cornered king, ask: does the king still have a square to go to? If not, is it in check?</p>

<!--ad-->
<h2>King and rook against king</h2>
<p>This takes a little longer, at most 16 moves with perfect play and usually more in practice, but the method is reliable.</p>
<ol>
  <li><b>Cut the king off with the rook.</b> Put the rook on a rank or file that splits the board, keeping the enemy king in the larger or smaller part.</li>
  <li><b>Bring your king up.</b> Walk it towards the enemy king, staying on the same side of the rook as your king.</li>
  <li><b>Use the opposition.</b> When the two kings stand face to face with one square between them (for example white king on e6, black king on e8), a rook check along the rank, Ra8, is mate if the king can't escape sideways.</li>
  <li><b>Use waiting moves.</b> If the enemy king steps sideways instead of facing yours, don't chase it with checks. Follow it with your king, or make a quiet rook move along its file or rank (a "tempo move") so that the enemy king has to step back into the opposition.</li>
  <li><b>Shrink the box.</b> Each time the enemy king retreats, move the rook one rank or file closer, keeping it protected or far from the enemy king.</li>
</ol>
<p>The key principle is that the rook builds walls and your king pushes. The rook alone can never force mate, and checks alone just chase the king around.</p>

<h2>Why the details matter</h2>
<ul>
  <li><b>The fifty-move rule.</b> If fifty moves pass on each side with no capture or pawn move, either player can claim a draw. A slow method that wanders around can run out of time.</li>
  <li><b>Keep your rook safe.</b> A rook next to the enemy king, unprotected, can simply be taken. Keep it a distance away, or protected by your king.</li>
  <li><b>The clock.</b> In blitz, a fast, reliable method beats an elegant one. Practise until you can mate with king and rook in under 30 seconds.</li>
</ul>

<h2>What you can't mate with</h2>
<p>Some material is not enough to checkmate, and the game is drawn right away: a lone king against a king, king and bishop against king, or king and knight against king. King and two knights against king also can't force mate, although a mate is possible if the defender blunders.</p>

<h2>Practise it</h2>
<p>Play pass-and-play against yourself, starting from a position with just the kings and a queen or rook, and mate the lone king. Do it until it feels boring. Then try it with the clock running. It's the cheapest rating points you'll ever earn.</p>`,
  },
  {
    slug: 'pawn-endgames',
    level: 'Endgames',
    title: 'Pawn Endgames: Opposition, Key Squares and the Square Rule',
    description: 'The core ideas of king and pawn endgames: the rule of the square, opposition, key squares and outside passed pawns, explained for club players.',
    body: `<p>When all the pieces are traded and only kings and pawns are left, every move counts. There are no pieces to cover your mistakes and almost no second chances. The good news is that pawn endgames follow clear rules. Learn a few of them and you'll know whether to trade into one, and how to win or hold it.</p>

<h2>The king becomes a fighter</h2>
<p>In the middlegame, the king hides. In the endgame, it's one of your strongest pieces. With fewer pieces to threaten it, the king should march towards the centre and the pawns. A common winning plan is simply to get your king closer to the action than your opponent's.</p>

<h2>The rule of the square</h2>
<p>Can the enemy king catch your passed pawn? You don't need to count moves. Imagine a square drawn from the pawn to its promotion rank: one side is the distance from the pawn to the last rank, and the square extends that same distance sideways towards the defending king.</p>
<p>If the defending king can step into that square on its move, it catches the pawn. If it can't, the pawn queens. For example, a white pawn on a4 needs four moves to queen; its square has corners a4, a8, e8 and e4. If Black's king is on f5 and it's Black's turn, Ke5 or Ke4 enters the square and catches the pawn. If it's White's turn, a5 shrinks the square to a5-d8, and the king on f5 can't get in.</p>
<p>Remember that a pawn on its starting square can move two steps, so count it as if it were already on the third rank (or sixth for Black).</p>

<!--ad-->
<h2>The opposition</h2>
<p>When two kings stand facing each other with one square between them, on the same rank or file, they're said to be in <b>opposition</b>. The side that <b>doesn't</b> have to move "has the opposition", because the other king must give way.</p>
<p>Opposition decides the most basic endgame of all: king and pawn against king. The simplest rule to remember is this: <b>the attacking king should get in front of its pawn</b>. With the white king on e6, in front of a pawn on e5, and the black king on e8, White wins whoever is to move: the king uses the opposition to push the defender aside and escort the pawn home. A king on the sixth rank in front of its pawn wins for any pawn except a rook's pawn.</p>
<p>When the defending king stands directly in front of the pawn and the attacking king is behind it, the position is usually drawn: the defender just keeps the opposition and shuffles back and forth.</p>

<h2>Key squares</h2>
<p>For every pawn there are <b>key squares</b>: if the attacking king reaches one of them, the pawn queens, whoever is to move. For a pawn on its second, third or fourth rank, the key squares are the three squares two ranks ahead of it: for a white pawn on e4, they are d6, e6 and f6. Once the pawn crosses into the enemy half, there are more key squares, so it gets easier for the attacker.</p>
<p>Thinking in key squares turns a hard calculation into a simple race: can my king reach a key square before the defending king takes the opposition against it?</p>

<h2>The rook's pawn exception</h2>
<p>A pawn on the a- or h-file is special. If the defending king reaches the corner square in front of it, the game is a draw, even if the attacking king is well placed: the defending king can't be forced out of the corner, and the attacker eventually has to allow stalemate or let the king out. That's why an extra rook's pawn is often not enough to win.</p>

<h2>Outside passed pawns</h2>
<p>A <b>passed pawn</b> is a pawn with no enemy pawn in front of it or on the files next to it, so nothing can stop it but pieces. An <b>outside</b> passed pawn is one far from the other pawns. It's a powerful weapon: the defending king has to go and stop it, and while it's away, the attacking king eats the pawns on the other side.</p>

<h2>Practical rules</h2>
<ul>
  <li><b>Count before you trade into a pawn endgame.</b> Since there's no way back, a pawn endgame should be calculated, not guessed.</li>
  <li><b>Activate the king early.</b> A tempo spent centralising the king is often decisive.</li>
  <li><b>Don't push pawns without a reason.</b> Pawn moves can't be undone, and a spare pawn move kept in reserve can win the opposition later.</li>
  <li><b>Create a passed pawn.</b> Where you have more pawns than your opponent, advance the pawn with no opponent first, the "candidate", and use the others to support it.</li>
</ul>

<h2>Practise it</h2>
<p>Set up king and pawn against king with pass-and-play and try both sides. Then try a position where each side has three pawns on the kingside and you have an extra pawn on the queenside: push your outside passer, decoy the enemy king, and take the kingside pawns.</p>`,
  },
  {
    slug: 'rook-endgames',
    level: 'Endgames',
    title: 'Rook Endgames: The Lucena and Philidor Positions',
    description: 'The two positions every chess player should know in rook endgames: how to win the Lucena by building a bridge, and how to draw the Philidor.',
    body: `<p>Rook endgames are the most common endgames in chess. Since rooks are usually the last pieces traded, roughly half of all endgames feature rooks. As the saying goes, "all rook endgames are drawn", which isn't true, but it captures how tricky they are to win. Two positions form the foundation of all rook endgame knowledge: the <b>Lucena</b>, which is a win, and the <b>Philidor</b>, which is a draw.</p>

<h2>The Philidor position: how to draw</h2>
<p>Imagine White has a king, a rook and a pawn, and Black has a king and a rook. The black king stands in front of the pawn. White's pawn has not yet reached the sixth rank. Here is Black's drawing method:</p>
<ol>
  <li><b>Put your rook on your third rank</b>, which for Black is the 6th rank. This stops White's king from advancing to the sixth rank in front of the pawn.</li>
  <li><b>Wait there.</b> Move the rook back and forth along that rank. White can't make progress without pushing the pawn.</li>
  <li><b>When the pawn advances to the sixth rank, send your rook to the far end of the board</b>, White's first rank, and check the white king from behind. Now the pawn on the sixth rank no longer shelters the king from vertical checks, and the king can't hide in front of it.</li>
</ol>
<p>The most common mistake is retreating the rook to your own back rank too early. Then White's king walks forward to the sixth rank and the defence collapses. Third rank first; first rank only after the pawn advances.</p>

<!--ad-->
<h2>The Lucena position: how to win</h2>
<p>Now the winning side. White's pawn is on the seventh rank, White's king is on the queening square in front of it, and the black king has been cut off by at least one file. Black's rook prevents White's king from getting out in front of the pawn. White's winning technique is called <b>building a bridge</b>.</p>
<p>A typical setup: White king on d8, pawn on d7, White rook on f1 cutting off the black king on g7, and Black's rook on c2 stopping White's king from stepping out to the c-file.</p>
<ol>
  <li><b>Rf4!</b> White moves the rook to the fourth rank. This is the key move; it will shortly be used as a shield.</li>
  <li>Black waits, for example with <b>Rc1</b>.</li>
  <li><b>Ke7</b>: White's king comes out. Black checks: <b>Re1+</b>.</li>
  <li><b>Kd6</b>, and Black checks again: <b>Rd1+</b>.</li>
  <li><b>Ke6</b>, and after <b>Re1+</b>, <b>Kd5</b>. Black checks once more, <b>Rd1+</b>...</li>
  <li><b>Rd4!</b>: the rook steps in front of the king and blocks the check. That's the bridge. The checks are over, and the pawn will promote.</li>
</ol>
<p>The details vary depending on where the pieces are, but the idea is always the same: put your rook on the fourth rank, walk the king out, and use the rook to block the checks.</p>

<h2>Rules of thumb</h2>
<ul>
  <li><b>Rooks belong behind passed pawns</b>, your own and your opponent's. Behind your own pawn, the rook gains activity as the pawn advances; behind your opponent's, it gains activity as the pawn advances too, while staying ready to capture.</li>
  <li><b>Activity beats material.</b> An active rook is often worth more than a pawn. A passive rook tied to defending a pawn usually loses.</li>
  <li><b>Cut off the enemy king.</b> A rook on a file between the enemy king and your pawn can win positions that would otherwise be drawn.</li>
  <li><b>Check from a distance.</b> Checks from close range let the king approach and escape. Long-range checks keep the defending rook safe and the king busy.</li>
</ul>

<h2>When an extra pawn isn't enough</h2>
<p>Many rook endgames with an extra pawn are drawn. Common examples: all the pawns on one side of the board (three pawns against two on the kingside is often a draw), or a rook's pawn with the defending king in front of it. If you're defending, aim for these. If you're attacking, keep pawns on both sides of the board to stretch the defence.</p>

<h2>Practise it</h2>
<p>Set up the Philidor and Lucena positions with pass-and-play and play them through until you can do both from memory. Then play the computer from the same positions and try to beat Max level: it will defend perfectly, so if you can win the Lucena against it, you really know it.</p>`,
  },
  {
    slug: 'middlegame-plans',
    level: 'Strategy',
    title: 'How to Make a Plan in the Middlegame',
    description: 'What to do after the opening: reading pawn structures, finding weak squares, using open files, improving your worst piece and choosing where to attack.',
    body: `<p>The opening is over: your pieces are developed and your king is castled. Now what? Many players feel lost at this point and start making random moves, waiting for something to happen. Strong players make <b>plans</b>, and those plans almost always come from the same few features of the position.</p>

<h2>Start with the pawns</h2>
<p>Pawns can't move backwards, so the <b>pawn structure</b> is the most permanent feature of the position. It tells you where to play.</p>
<ul>
  <li><b>Attack where you have more space.</b> If your pawns point towards one side of the board (for example, a pawn chain d4-e5 pointing at the kingside), that's where your pieces have the most room and where your attack should be.</li>
  <li><b>Pawn breaks.</b> A pawn break is a pawn move that challenges the enemy pawn chain, opening lines for your pieces. In most structures there are only one or two natural breaks for each side. Identify them, prepare them with your pieces, and push when you're ready.</li>
  <li><b>Pawn majorities.</b> If you have more pawns than your opponent on one side, advancing them creates a passed pawn, which is a big asset in the endgame.</li>
</ul>

<h2>Look for weaknesses</h2>
<p>A plan needs a target. Common targets are:</p>
<ul>
  <li><b>Isolated pawns</b>: pawns with no friendly pawns on the files beside them. They can only be defended by pieces.</li>
  <li><b>Backward pawns</b>: pawns that have fallen behind their neighbours and can't safely advance, often on a half-open file.</li>
  <li><b>Doubled pawns</b>: two pawns on the same file. They're not always weak, but they tend to be inflexible.</li>
  <li><b>Weak squares</b>: squares that no enemy pawn can ever attack. A knight on such a square in the enemy half, called an <b>outpost</b>, can dominate the board.</li>
  <li><b>An exposed king</b>: missing pawns in front of the king, or a king that never castled.</li>
</ul>

<!--ad-->
<h2>Open files and diagonals</h2>
<p>Rooks need open files, ones with no pawns on them, to get into the game. When a file opens, put a rook on it, and consider doubling rooks on it. The goal is often to reach the seventh rank, where a rook attacks pawns from the side and confines the enemy king. Bishops need open diagonals: a bishop blocked by its own pawns on its own colour is a "bad bishop", and fixing that, by trading it off or rearranging the pawns, is a plan in itself.</p>

<h2>Improve your worst piece</h2>
<p>When you can't find a concrete plan, use this simple rule: find your least active piece and make it better. A knight on the rim, a rook still in the corner, a bishop staring at its own pawns: give it a better square. Coaches repeat this advice for good reason: it's the most useful idea in quiet positions. It often prepares the real plan without you even noticing.</p>

<h2>Exchanges</h2>
<p>Trading pieces is a decision with consequences.</p>
<ul>
  <li><b>Trade when you're ahead in material</b>, to make the extra material count.</li>
  <li><b>Trade your bad pieces for their good ones.</b> Your bad bishop for their good knight is usually a good deal.</li>
  <li><b>Trade defenders when attacking.</b> If a knight on f6 guards the black king, exchanging it can open the way.</li>
  <li><b>Avoid trades when you're cramped</b>, unless they free your position. When your opponent has more space, trading usually helps you, because fewer pieces need fewer squares.</li>
</ul>

<h2>Prophylaxis: what does my opponent want?</h2>
<p>Before you make your plan, look at your opponent's. Which pawn break do they want? Which piece would they love to put on an outpost? Sometimes the best move simply stops their idea, and their position runs out of good moves. This kind of preventive thinking, called <b>prophylaxis</b>, is one of the habits that separates strong club players from everyone else.</p>

<h2>A simple planning routine</h2>
<ol>
  <li>Check for tactics first: checks, captures and threats for both sides.</li>
  <li>Look at the pawn structure: where should I play, and where should they?</li>
  <li>Find the weaknesses on both sides.</li>
  <li>Decide on a target and a plan: which piece goes where, and which pawn break comes when.</li>
  <li>If nothing is clear, improve your worst piece.</li>
</ol>

<h2>Practise it</h2>
<p>In your next game against the computer, stop after move 15 and write down a plan in one sentence before you continue, for example "put a knight on d5 and double rooks on the c-file". At the end, check whether you followed it. Planning is a skill like any other: the more often you do it consciously, the faster it becomes.</p>`,
  },
  {
    slug: 'common-mistakes',
    level: 'Basics',
    title: '10 Common Chess Mistakes Beginners Make',
    description: 'The ten mistakes that cost beginners the most games, from hanging pieces and early queen moves to ignoring threats and playing too fast, and how to fix each one.',
    body: `<p>Most games between beginners aren't won by brilliant moves; they're lost by avoidable ones. The good news is that the same few mistakes come up again and again, which means fixing them is the fastest way to improve. Here are the ten most common, and what to do instead.</p>

<h2>1. Hanging pieces</h2>
<p>Leaving a piece where it can be captured for free is the number-one cause of lost games. Before every move, check that the piece you're moving will be safe on its new square, and that moving it doesn't leave another piece undefended.</p>

<h2>2. Ignoring your opponent's last move</h2>
<p>Every move your opponent makes has a purpose. Before you think about your own plan, ask: <b>what does that move threaten?</b> Does it attack a piece, prepare a check, or open a line towards your king? This one question prevents more blunders than any other habit.</p>

<h2>3. Bringing the queen out too early</h2>
<p>An early queen can win a pawn or set a trap, but it usually becomes a target. Your opponent develops pieces with tempo by attacking it, and you end up behind in development. Develop your knights and bishops first; the queen can join later.</p>

<h2>4. Moving the same piece repeatedly in the opening</h2>
<p>Every move spent on a piece that's already developed is a move not spent on one that isn't. Unless you're capturing something or escaping an attack, bring out a new piece. See our guide to <a href="/learn/opening-principles">opening principles</a> for the full set of rules.</p>

<!--ad-->
<h2>5. Not castling</h2>
<p>A king left in the centre gets caught when the central files open. Castle early, usually within the first ten moves. If you have a reason not to, make sure the centre will stay closed.</p>

<h2>6. Pushing pawns in front of your king</h2>
<p>After castling, pawn moves like g4 or h4 can be part of an attack, but they also open lines towards your own king. Each pawn move leaves squares behind that can't be defended by pawns again. Push them only with a clear purpose.</p>

<h2>7. Grabbing material without checking the cost</h2>
<p>A free pawn isn't free if taking it puts your queen offside, opens a file towards your king or wastes two moves. When you see a capture that looks too good, look again: what can your opponent do after it?</p>

<h2>8. Trading when you're behind (and not trading when you're ahead)</h2>
<p>When you're up material, trading pieces makes your advantage grow. When you're down, every trade makes the deficit harder to overcome. Beginners often do the opposite, swapping pieces to "simplify" when losing and avoiding trades when winning. Reverse it. Read more in <a href="/learn/piece-values">chess piece values</a>.</p>

<h2>9. Playing too fast</h2>
<p>Especially in online games, it's tempting to move instantly. Fast moves are fine in quiet positions, but when pieces are attacking each other, slow down. In a game with a 10-minute clock you have time to spend 30 seconds on a critical move. Use it. Our guide to <a href="/learn/time-management">managing your clock</a> covers this in detail.</p>

<h2>10. Resigning or giving up too early</h2>
<p>Beginners resign positions that are still playable, and stop trying once they're a piece down. At lower levels, games swing wildly; your opponent may well blunder back. Keep making the most difficult moves you can, look for tricks, and remember that stalemate is a draw. Only resign when there's truly nothing left.</p>

<h2>The blunder check</h2>
<p>Most of these mistakes can be prevented with a short routine before each move, which takes only a few seconds once it becomes a habit:</p>
<ol>
  <li>What did my opponent's last move threaten?</li>
  <li>What are all my checks, captures and threats?</li>
  <li>After the move I want to play, what are all of my opponent's checks, captures and threats?</li>
</ol>
<p>If step 3 turns up a problem, pick a different move. This is the single most useful habit in chess, and grandmasters do it too, just faster.</p>

<h2>Practise it</h2>
<p>Play a game against the computer on Easy using the blunder check before every single move, even obvious ones. It'll feel slow. Then play another. Then review both in the move list and count how many pieces you lost to simple captures. That number should go to zero quickly.</p>`,
  },
  {
    slug: 'time-management',
    level: 'Strategy',
    title: 'Managing Your Clock in Blitz and Rapid Chess',
    description: 'How to use your time in online chess: how increments work, where to spend your minutes, when to move fast, and how to handle time trouble in bullet, blitz and rapid.',
    body: `<p>In online chess the clock is part of the game. A winning position doesn't count if your time runs out first, and many games are decided not by the best move but by who managed their minutes better. Good time management is a skill you can learn, and it's worth as many rating points as a new opening.</p>

<h2>How time controls work</h2>
<p>A time control like <b>5+3</b> means each player starts with 5 minutes and gets 3 extra seconds after every move they make. The extra seconds are the <b>increment</b>. Your clock only runs on your turn. On 3D Chess you can choose from bullet (1+0), blitz (3+2 and 5+3), rapid (10+0 and 15+10) or no clock at all.</p>
<p>Increments change everything about the endgame. Without one, a player with a few seconds left can lose on time in a winning position. With even a 2-second increment, you can always keep playing as long as you move quickly, which rewards technique over speed.</p>

<h2>Budgeting your time</h2>
<p>A useful rule: most games last around 40 moves, so plan to spend roughly your total time divided by 40 on an average move, plus the increment. In a 10+0 game that's about 15 seconds per move. But you shouldn't spend the same time on every move.</p>
<ul>
  <li><b>Opening</b>: move quickly. If you know your opening, there's nothing to calculate. Spend extra time only when your opponent surprises you.</li>
  <li><b>Critical moments</b>: spend real time here. When pieces start being exchanged, when the position opens, or when you're choosing between plans, a minute of thought can decide the game.</li>
  <li><b>Recaptures and forced moves</b>: play them instantly. If there's only one legal or sensible move, don't spend time on it.</li>
  <li><b>Winning positions</b>: don't relax. Spend enough time to avoid blunders, but simplify: trade pieces, choose safe moves, and convert.</li>
</ul>

<!--ad-->
<h2>When to think hard</h2>
<p>Experienced players develop a sense for the moments that matter. Signs that you should slow down:</p>
<ul>
  <li>Your opponent just made an unexpected move.</li>
  <li>There are captures or checks available for either side.</li>
  <li>You're about to make an irreversible decision: a pawn break, trading into an endgame, or a sacrifice.</li>
  <li>Your plan just changed, or you don't know what to do next.</li>
</ul>
<p>And signs you're thinking too much: you've been comparing the same two quiet moves for a long time, or you're trying to calculate a position to the very end when a sensible move will do.</p>

<h2>Handling time trouble</h2>
<p>Sooner or later, you'll be down to your last seconds. Here's how to survive it:</p>
<ul>
  <li><b>Keep it simple.</b> Play safe moves that don't require calculation. Avoid complications.</li>
  <li><b>Use the increment.</b> Moving in under the increment time gains time on every move. In a 3+2 game, a 1-second move gains you a second.</li>
  <li><b>Trade pieces</b> if you're not worse. Fewer pieces means fewer things to calculate.</li>
  <li><b>Watch for checks.</b> Even in a rush, look at your opponent's checks. Most time-trouble disasters are unseen checks.</li>
</ul>

<h2>When your opponent is short of time</h2>
<p>If your opponent is in time trouble and you're not, don't rush to match their speed. Use your time to find good moves and keep the position complicated: give them problems to solve. But don't play hopeless tricks either; a solid position with lots of options is more pressure than one cheap trap.</p>

<h2>Bullet, blitz and rapid</h2>
<ul>
  <li><b>Bullet (1+0)</b>: almost pure intuition. Pattern recognition and quick hands matter most. Great for fun, less useful for learning.</li>
  <li><b>Blitz (3+2, 5+3)</b>: enough time for short calculations at critical moments. A good balance between speed and quality.</li>
  <li><b>Rapid (10+0, 15+10)</b>: time to think properly. If you want to improve, play mostly rapid, then review your games.</li>
</ul>

<h2>The first move rule</h2>
<p>On 3D Chess, each player has 30 seconds to make their first move or the game is aborted with no result. It's designed to stop abandoned games from wasting your time, so don't let your coffee break start before your first move.</p>

<h2>Practise it</h2>
<p>Play five rapid games and, after each, look at how much time you had left and where you spent it. If you regularly finish with half your time unused, you're moving too fast. If you're often under a minute by move 25, you're overthinking the opening or quiet moves.</p>`,
  },
  {
    slug: 'how-to-improve',
    level: 'Strategy',
    title: 'How to Get Better at Chess: A Practical Training Plan',
    description: 'A realistic plan to improve at chess: how much time to spend on tactics, endgames, openings and playing, and how to learn from every game you lose.',
    body: `<p>Many players play hundreds of games and stay at the same level. Playing is necessary, but it isn't enough on its own. Improvement comes from a mix of playing, reviewing and focused study. Here's a practical plan that works for most players, whether you have 20 minutes a day or several hours a week.</p>

<h2>The big picture</h2>
<p>For players rated up to about 1500, almost all games are decided by tactics: pieces left hanging, forks missed, mates overlooked. So the plan is weighted heavily towards tactics and towards playing games you can learn from. Openings come last, because at this level they matter far less than they seem to.</p>
<p>A good weekly balance:</p>
<ul>
  <li><b>About 40%: tactics.</b> Puzzles, and spotting patterns in real games.</li>
  <li><b>About 30%: playing and reviewing.</b> Longer games, followed by honest review.</li>
  <li><b>About 20%: endgames.</b> The basic checkmates, pawn endgames and rook endgames.</li>
  <li><b>About 10%: openings.</b> Just enough to reach a playable middlegame.</li>
</ul>

<h2>Tactics: a little every day</h2>
<p>Tactics are pattern recognition, and patterns are learned by repetition. Ten or fifteen puzzles a day beats a two-hour session once a week. Try to solve each puzzle completely before moving: find the whole sequence, including your opponent's best replies, not just the first move. Start with the patterns in our guides to <a href="/learn/forks-pins-skewers">forks, pins and skewers</a>, <a href="/learn/discovered-attacks">discovered attacks</a> and <a href="/learn/checkmate-patterns">checkmate patterns</a>.</p>

<h2>Play longer games</h2>
<p>Bullet and blitz are fun, but in fast games you don't have time to think, so you mostly repeat what you already know. To improve, play at least some games at a <b>rapid</b> time control, like 10+0 or 15+10, where you have time to calculate and apply what you've studied. Think of blitz as exercise and rapid as training.</p>

<!--ad-->
<h2>Review every loss</h2>
<p>A loss is the best lesson you'll get, but only if you study it. After each serious game:</p>
<ol>
  <li><b>Go through it yourself first</b>, before using an engine. Find the moment where things went wrong, and what you were thinking.</li>
  <li><b>Then check with the engine.</b> Look for the biggest swings, not every small inaccuracy.</li>
  <li><b>Name the mistake.</b> Was it a tactic you missed? A plan you didn't have? Time trouble? An opening you didn't understand?</li>
  <li><b>Look for patterns across games.</b> If you keep losing pieces to knight forks, or keep running short of time, that's what to work on next.</li>
</ol>
<p>Reviewing your wins helps too: you'll often find your opponent missed something, and so did you.</p>

<h2>Endgames: small investment, big return</h2>
<p>Learning the <a href="/learn/basic-checkmates">basic checkmates</a>, the essentials of <a href="/learn/pawn-endgames">pawn endgames</a> and the <a href="/learn/rook-endgames">Lucena and Philidor positions</a> takes a few hours and pays off for the rest of your chess life. Endgame knowledge also improves your middlegame decisions: you'll know which trades lead to winning endgames and which to avoid.</p>

<h2>Openings: principles first</h2>
<p>Pick one opening as White and one defence each against 1.e4 and 1.d4, and stick with them so you learn their typical plans. The <a href="/learn/italian-game">Italian Game</a>, the <a href="/learn/queens-gambit">Queen's Gambit</a> and the <a href="/learn/sicilian-defence">Sicilian Defence</a> are all good choices. Learn the ideas, not long lines, and lean on the <a href="/learn/opening-principles">opening principles</a> when you're out of book.</p>

<h2>Mindset and habits</h2>
<ul>
  <li><b>Use the blunder check on every move</b>: checks, captures and threats for both sides. It's the single most useful habit in chess, described in <a href="/learn/common-mistakes">common mistakes</a>.</li>
  <li><b>Play opponents a little stronger than you.</b> The computer at the next level up, or rated opponents just above your rating.</li>
  <li><b>Take breaks after losses.</b> Playing angry leads to quick, careless games. A short pause protects your rating.</li>
  <li><b>Track progress over months, not days.</b> Ratings go up and down. Over a few months of consistent work, the trend is what matters.</li>
</ul>

<h2>A sample week, 30 minutes a day</h2>
<ul>
  <li><b>Monday, Wednesday, Friday</b>: 15 minutes of puzzles, then one rapid game.</li>
  <li><b>Tuesday</b>: 15 minutes of endgame study, then review a game from the weekend.</li>
  <li><b>Thursday</b>: 15 minutes of puzzles, then 15 minutes on your opening ideas.</li>
  <li><b>Weekend</b>: play a few longer games, and review one loss carefully.</li>
</ul>

<h2>Start now</h2>
<p>The best time to start is your next game. Play a rapid game against an opponent or the computer, review it straight afterwards, and write down one thing to do differently next time. Do that consistently and you'll be surprised how quickly the numbers move.</p>`,
  },
];
