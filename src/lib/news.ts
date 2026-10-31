export type NewsCard = {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  mood: "good" | "bad";
  freezeMs?: number;
};

export const NEWS: NewsCard[] = [
  { id: "tweet", emoji: "🚀", title: "A billionaire tweets: “AIR to the moon!”", sub: "Everyone is talking about AIR.", mood: "good" },
  { id: "bank", emoji: "🏦", title: "A big bank will accept AIR", sub: "Real-world use, finally?", mood: "good" },
  { id: "listing", emoji: "🌍", title: "AIR listed on the world’s largest exchange", sub: "Millions of new buyers can now trade it.", mood: "good" },
  { id: "hack", emoji: "💀", title: "Exchange hacked!", sub: "Trading is frozen for 8 seconds.", mood: "bad", freezeMs: 8000 },
  { id: "ban", emoji: "🏛️", title: "Government considers banning AIR", sub: "Nothing is decided yet.", mood: "bad" },
  { id: "founder", emoji: "🕵️", title: "Rumour: the founder sold everything", sub: "No one can confirm it.", mood: "bad" },
  { id: "fake", emoji: "🤡", title: "Oops — that tweet was fake", sub: "The account was a parody.", mood: "bad" },
  { id: "energy", emoji: "⚡", title: "Report: AIR mining uses as much power as a small country", sub: "Climate groups are furious.", mood: "bad" },
];

export const newsById = (id: string) => NEWS.find((n) => n.id === id);
