export type MemeVariant = {
  url: string;
  useWhen: string;
};

export type MemeEntry = {
  category: string;
  memes: MemeVariant[];
  description?: string;
  // Backward compatibility: old format
  url?: string[];
};

export const memes: MemeEntry[] = [
  {
    category: "start",
    description: "When CodeTurtle starts reviewing your code.",
    memes: [
      { url: "https://media1.tenor.com/m/Q8WZ20gMCOoAAAAC/let-him-cook.gif", useWhen: "Use for review-start announcements with hype energy." },
      { url: "https://media1.tenor.com/m/l7-ORI8t6IwAAAAC/walter-white-cooking.gif", useWhen: "Use when analysis has started and code is being cooked." },
      { url: "https://media1.tenor.com/m/L7FjYL2mkw8AAAAd/breaking-bad-let-me-cook.gif", useWhen: "Use when starting deep technical review mode." },
      { url: "https://media1.tenor.com/m/l1sDchNVEs4AAAAC/tony-stark-jarvis.gif", useWhen: "Use when presenting a smart-assistant style review kickoff." },
    ],
  },
  {
    category: "success",
    description: "When CodeTurtle approves your PR.",
    memes: [
      { url: "https://media.tenor.com/cS5jqwPsXAwAAAAM/high-five-walter-white.gif", useWhen: "Use when approval is clear and celebratory." },
      { url: "https://media1.tenor.com/m/KoEBx4a31-gAAAAC/jarvis.gif", useWhen: "Use for clean successful outcomes with confident vibe." },
      { url: "https://tenor.com/view/happy-cat-gif-10804346947536782797", useWhen: "Use when CodeTurtle is happy after a good review outcome." },
    ],
  },
  {
    category: "failure",
    description: "When CodeTurtle requests changes on your PR.",
    memes: [
      { url: "https://media1.tenor.com/m/fJYNmNVhMt4AAAAC/task-failed-successfully.gif", useWhen: "Use when checks fail but feedback is constructive." },
      { url: "https://media1.tenor.com/m/L7FjYL2mkw8AAAAd/breaking-bad-let-me-cook.gif", useWhen: "Use when large rework is needed before merge." },
      { url: "https://tenor.com/view/cat-pray-gif-7311821686518967438", useWhen: "Use when CodeTurtle is praying the next attempt passes." },
      { url: "https://tenor.com/view/black-man-crying-cry-crying-crying-emoji-crying-meme-gif-3223392509479903783", useWhen: "Use for high-stakes 'please let this pass' moments." },
      { url: "https://tenor.com/view/sad-lonely-alone-chandler-bing-gif-22422379", useWhen: "Use when outcome feels sad and lonely after failure." },
      { url: "https://tenor.com/view/sadhamstergirl-gif-4231717927828306245", useWhen: "Use when feedback is rough and mood is emotional." },
    ],
  },
  {
    category: "in-progress",
    description: "When CodeTurtle is still reviewing your code.",
    memes: [
      { url: "https://media1.tenor.com/m/lTyMCVhkmxkAAAAC/cook-chef.gif", useWhen: "Use while review is actively running." },
    ],
  },
  {
    category: "quota-limit",
    description: "When you hit your AI review quota limit.",
    memes: [
      { url: "https://media1.tenor.com/m/pHSC-PR_tc4AAAAC/wallet.gif", useWhen: "Use when user hits monthly or plan quota." },
      { url: "https://media1.tenor.com/m/_AqpYO1IK9YAAAAC/maxlimit-fatpony.gif", useWhen: "Use when hard limits block further reviews." },
    ],
  },
  {
    category: "8/10 or 9/10 or 10/10 review",
    description: "When CodeTurtle gives you a high score on your code review.",
    memes: [
      { url: "https://media1.tenor.com/m/New343NgFcEAAAAd/chirby-kirby.gif", useWhen: "Use for high-scoring reviews and polished PRs." },
      { url: "https://tenor.com/view/happy-cat-gif-10804346947536782797", useWhen: "Use when quality is high and CodeTurtle is clearly happy." },
    ],
  },
  {
    category: "1/10 or 2/10 or 3/10 review",
    description: "When CodeTurtle gives you a low score on your code review.",
    memes: [
      { url: "https://media1.tenor.com/m/9eMkyB57CrAAAAAC/gwkking-sticker.gif", useWhen: "Use when quality score is very low." },
      { url: "https://media1.tenor.com/m/Y2qHMeBTHFsAAAAC/gwkking-sticker.gif", useWhen: "Use for severe quality or correctness problems." },
      { url: "https://tenor.com/view/ugly-plankton-meme-ugly-plankton-ugly-face-plankton-meme-plankton-gif-15836444981074643801", useWhen: "Use when code quality is very bad and needs significant cleanup." },
      { url: "https://tenor.com/view/sad-lonely-alone-chandler-bing-gif-22422379", useWhen: "Use for low-score reviews with a disappointed vibe." },
      { url: "https://tenor.com/view/sadhamstergirl-gif-4231717927828306245", useWhen: "Use for very low-score, emotionally painful outcomes." },
    ],
  },
  {
    category: "auth-failure",
    description: "When CodeTurtle fails to authenticate with the AI provider.",
    memes: [
      { url: "https://media1.tenor.com/m/-GrtHNEPx8YAAAAC/nahdog.gif", useWhen: "Use when auth/token credentials are invalid or expired." },
    ],
  },
  {
    category: "user says something useful to CodeTurtle",
    description: "When you provide helpful feedback to CodeTurtle.",
    memes: [
      { url: "https://media1.tenor.com/m/ejNr2aMcwiIAAAAC/ishowspeed-speed.gif", useWhen: "Use when user provides constructive direction." },
      { url: "https://tenor.com/view/fire-writing-holy-holy-writing-fire-writing-gif-12998741943022322982", useWhen: "Use when user says something very insightful and worth highlighting." },
      { url: "https://tenor.com/view/firebook-kongo-nigeria-gif-6324230472092404887", useWhen: "Use when user drops an interesting idea worth noting." },
      { url: "https://tenor.com/view/shakespeare-gif-10993323024607926481", useWhen: "Use when user says something unexpectedly smart or poetic." },
      { url: "https://tenor.com/view/shakespeare-meme-shakespeare-shakespeare-you-gif-4055677556302353388", useWhen: "Use when user message sounds dramatic but genuinely insightful." },
    ],
  },
  {
    category: "user says something funny to CodeTurtle",
    description: "When you crack a joke while interacting with CodeTurtle.",
    memes: [
      { url: "https://media1.tenor.com/m/_J7d7J0v6FsAAAAd/ishowspeed-laugh.gif", useWhen: "Use for playful or humorous user comments." },
      { url: "https://tenor.com/view/conanwolf-gif-15824252101317178951", useWhen: "Use when bot is watching the drama with popcorn energy." },
    ],
  },
  {
    category: "user says something rude to CodeTurtle",
    description: "When you get frustrated and take it out on CodeTurtle.",
    memes: [
      { url: "https://media1.tenor.com/m/_J7d7J0v6FsAAAAd/ishowspeed-laugh.gif", useWhen: "Use to defuse mildly rude comments without escalation." },
      { url: "https://tenor.com/view/leroyazizsane-gif-10655214125102092739", useWhen: "Use when user calls CodeTurtle lazy." },
      { url: "https://tenor.com/view/brick-wall-talking-to-wall-talking-to-a-brick-wall-talking-to-yourself-spouting-nonsense-gif-9223278464067017147", useWhen: "Use when conversation feels unproductive like talking to a wall." },
      { url: "https://tenor.com/view/clueless-aware-twitch-forsen-emote-gif-25354609", useWhen: "Use when user tone is sarcastic/cruel but response should stay calm." },
    ],
  },
  {
    category: "user gives CodeTurtle a compliment",
    description: "When you compliment CodeTurtle on its review.",
    memes: [
      { url: "https://media1.tenor.com/m/17tz5nLA3I0AAAAC/%D0%B4.gif", useWhen: "Use for warm appreciation and thank-you comments." },
      { url: "https://media1.tenor.com/m/b400ZuFTby4AAAAC/flight-reacts-happy.gif", useWhen: "Use when user is visibly happy with review quality." },
      { url: "https://media1.tenor.com/m/YYf0IxWY45kAAAAC/ishowspeed-speed.gif", useWhen: "Use for energetic positive feedback." },
    ],
  },
  {
    category: "user insults CodeTurtle",
    description: "When you insult CodeTurtle out of frustration.",
    memes: [
      { url: "https://media1.tenor.com/m/34zEk132zrMAAAAC/bla-bla-dont-care.gif", useWhen: "Use when user posts direct insult and bot should stay calm." },
      { url: "https://media1.tenor.com/m/il1Lc-1YUigAAAAC/idc-i-don%27t-care.gif", useWhen: "Use for dismissive tone in hostile feedback." },
    ],
  },
  {
    category: "user says love you",
    description: "When user says love you to CodeTurtle.",
    memes: [
      { url: "https://media1.tenor.com/m/j6h-FiMlofkAAAAC/primo.gif", useWhen: "Use for affectionate user messages." },
    ],
  },
  {
    category: "didn't understand user input",
    description: "When CodeTurtle doesn't understand the user's input.",
    memes: [
      { url: "https://media1.tenor.com/m/B4Jgefo7h2YAAAAC/didn%27t-understand-have-a-bad-day.gif", useWhen: "Use when mention text is unclear or cannot be parsed." },
      { url: "https://tenor.com/view/olha-la-meme-emogi-gif-2981557596390159971", useWhen: "Use when bot is shocked/confused and pointing at unclear input." },
    ],
  }
];

export default memes;
