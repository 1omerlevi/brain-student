import dotenv from "dotenv";
import retrieveMemories from "./retrieveMemories.js";

dotenv.config();

async function main() {
  const sceneInput = {
    scenario_assessment: {
      scenario_present: true,
      confidence: "high",
      reasoning:
        "The image clearly depicts an interaction where one character is visibly distressed while two other characters are smiling and pointing at them, indicating a clear event or situation.",
    },
    scene_understanding: {
      scenario_description:
        "Spongebob Squarepants appears distressed and is holding a spatula, while Patrick Star and another character are smiling and pointing towards him.",
      observable_elements: [
        "Spongebob Squarepants",
        "Patrick Star",
        "another character",
        "spatula",
        "pointing gesture",
        "smiles",
        "distressed expression",
      ],
      key_actor: "Spongebob Squarepants",
    },
    reaction_snapshot: {
      internal_emotion: "embarrassed",
      thought_direction: "mentally spiraling",
      reaction_intensity: "high",
    },
    topK: 5,
  } as const;

  try {
    const memories = await retrieveMemories(sceneInput as any);
    console.log("Top memories:", JSON.stringify(memories, null, 2));
  } catch (err) {
    console.error("Error running retrieveMemories:", err);
  }
}

main();
