export type MemeEntry = {
  category: string;
  url: string[];
  description: string;
};

export const memes: MemeEntry[] = [
  {
    category: "start",
    url: [
      "https://media1.tenor.com/m/Q8WZ20gMCOoAAAAC/let-him-cook.gif",
      "https://media1.tenor.com/m/l7-ORI8t6IwAAAAC/walter-white-cooking.gif",
      "https://media1.tenor.com/m/L7FjYL2mkw8AAAAd/breaking-bad-let-me-cook.gif",
      "https://media1.tenor.com/m/l1sDchNVEs4AAAAC/tony-stark-jarvis.gif",
    ],
    description: "When CodeTurtle starts reviewing your code.",
  },
  {
    category: "success",
    url: ["https://media.tenor.com/cS5jqwPsXAwAAAAM/high-five-walter-white.gif", "https://media1.tenor.com/m/KoEBx4a31-gAAAAC/jarvis.gif"],
    description: "When CodeTurtle approves your PR.",
  },
  {
    category: "failure",
    url: ["https://media1.tenor.com/m/fJYNmNVhMt4AAAAC/task-failed-successfully.gif", "https://media1.tenor.com/m/L7FjYL2mkw8AAAAd/breaking-bad-let-me-cook.gif"],
    description: "When CodeTurtle requests changes on your PR.",
  },
  {
    category: "in-progress",
    url: ["https://media1.tenor.com/m/lTyMCVhkmxkAAAAC/cook-chef.gif"],
    description: "When CodeTurtle is still reviewing your code.",
  },
  {
    category: "quota-limit",
    url: ["https://media1.tenor.com/m/pHSC-PR_tc4AAAAC/wallet.gif", "https://media1.tenor.com/m/_AqpYO1IK9YAAAAC/maxlimit-fatpony.gif"],
    description: "When you hit your AI review quota limit.",
  },
  {
    category: "8/10 or 9/10 or 10/10 review",
    url: ["https://media1.tenor.com/m/New343NgFcEAAAAd/chirby-kirby.gif"],
    description: "When CodeTurtle gives you a high score on your code review.",
  },
  {
    category: "1/10 or 2/10 or 3/10 review",
    url: ["https://media1.tenor.com/m/9eMkyB57CrAAAAAC/gwkking-sticker.gif", "https://media1.tenor.com/m/Y2qHMeBTHFsAAAAC/gwkking-sticker.gif"],
    description: "When CodeTurtle gives you a low score on your code review.",
  },
  {
    category: "auth-failure",
    url: ["https://media1.tenor.com/m/-GrtHNEPx8YAAAAC/nahdog.gif"],
    description: "When CodeTurtle fails to authenticate with the AI provider.",
  },
  {
    category: "user says something useful to CodeTurtle",
    url: ["https://media1.tenor.com/m/ejNr2aMcwiIAAAAC/ishowspeed-speed.gif"],
    description: "When you provide helpful feedback to CodeTurtle.",
  },
  {
    category: "user says something funny to CodeTurtle",
    url: ["https://media1.tenor.com/m/_J7d7J0v6FsAAAAd/ishowspeed-laugh.gif"],
    description: "When you crack a joke while interacting with CodeTurtle.",
  },
  {
    category: "user says something rude to CodeTurtle",
    url: ["https://media1.tenor.com/m/_J7d7J0v6FsAAAAd/ishowspeed-laugh.gif"],
    description: "When you get frustrated and take it out on CodeTurtle.",
  },
  {
    category: "user gives CodeTurtle a compliment",
    url: [
      "https://media1.tenor.com/m/17tz5nLA3I0AAAAC/%D0%B4.gif",
      "https://media1.tenor.com/m/b400ZuFTby4AAAAC/flight-reacts-happy.gif",
      "https://media1.tenor.com/m/YYf0IxWY45kAAAAC/ishowspeed-speed.gif",
    ],
    description: "When you compliment CodeTurtle on its review.",
  },
  {
    category: "user insults CodeTurtle",
    url: [
      "https://media1.tenor.com/m/34zEk132zrMAAAAC/bla-bla-dont-care.gif",
      "https://media1.tenor.com/m/il1Lc-1YUigAAAAC/idc-i-don%27t-care.gif",
    ],
    description: "When you insult CodeTurtle out of frustration.",
  },
  {
    category: "user says love you",
    url: ["https://media1.tenor.com/m/j6h-FiMlofkAAAAC/primo.gif"],
    description: "When user says love you to CodeTurtle.",
  },
  {
    category:"didn't understand user input",
    url: ["https://media1.tenor.com/m/B4Jgefo7h2YAAAAC/didn%27t-understand-have-a-bad-day.gif"],
    description: "When CodeTurtle doesn't understand the user's input.",
  }
];

export default memes;
