import { CharacterService } from "../services/CharacterService.js";

export async function loadOrCreateCharacter(userId, name, classId) {
  // Legacy path — prefer CharacterService.list + create from lobby
  const list = await CharacterService.list(userId);
  if (list.length) return { character: list[0], offline: !list[0].id, error: null };
  try {
    const character = await CharacterService.create(userId, {
      name,
      classId,
      spec: classId === "ninja" ? "blade" : classId === "shaman" ? "dragon" : classId === "sura" ? "weaponry" : "body",
      kingdom: 1,
      gender: "m",
      deletePin: "0000",
    });
    return { character, offline: false };
  } catch (e) {
    const { createNewCharacter } = await import("../game/character.js");
    return { character: createNewCharacter(name, classId), offline: true, error: e.message };
  }
}

export async function saveCharacter(userId, ch) {
  return CharacterService.save(userId, ch);
}
