import "dotenv/config";
import { retrieveMemories } from "../retrieval/retrieveMemories.js";

const sampleInput = {
  imageInterpretation: "Friends packed into a dorm room getting ready for a themed party.",
  emotionalTone: "chaotic, funny, excited",
  captionGoal: "Find culturally specific shared student memories that feel relatable and safe.",
  sceneDetails: ["crowded mirror selfie", "weekend pregame", "dorm decor"],
  keywords: ["roommate", "pregame", "party theme", "campus weekend"],
};

try {
  const memoryPacket = await retrieveMemories(sampleInput);
  console.log(JSON.stringify(memoryPacket, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
