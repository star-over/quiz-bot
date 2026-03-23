import { describe, it, expect } from "vitest";
import { profileKey } from "../../convex/users";

describe("profileKey", () => {
  it("включает все поля через разделитель NUL", () => {
    const key = profileKey({
      firstName: "John",
      lastName: "Doe",
      username: "johndoe",
      languageCode: "en",
    });
    expect(key).toBe("John\0Doe\0johndoe\0en");
  });

  it("optional поля заменяются пустой строкой", () => {
    const key = profileKey({ firstName: "John" });
    expect(key).toBe("John\0\0\0");
  });

  it("разные профили дают разные ключи", () => {
    const key1 = profileKey({ firstName: "John", username: "john" });
    const key2 = profileKey({ firstName: "John", username: "jane" });
    expect(key1).not.toBe(key2);
  });

  it("одинаковые профили дают одинаковые ключи", () => {
    const args = { firstName: "John", lastName: "Doe", languageCode: "ru" };
    expect(profileKey(args)).toBe(profileKey(args));
  });

  it("lastName в поле username не путается с username", () => {
    const keyWithLastName = profileKey({ firstName: "A", lastName: "B" });
    const keyWithUsername = profileKey({ firstName: "A", username: "B" });
    expect(keyWithLastName).not.toBe(keyWithUsername);
  });
});
