import { z } from "zod";
import { ToolDefinition } from "../registry";

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

const constants: Record<string, number> = { PI: Math.PI, E: Math.E };
const functions: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      while (index < expression.length && /[0-9.]/.test(expression[index])) index++;
      const raw = expression.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      const start = index;
      while (index < expression.length && /[A-Za-z]/.test(expression[index])) index++;
      tokens.push({ type: "identifier", value: expression.slice(start, index) });
      continue;
    }

    if (["+", "-", "*", "/"].includes(char)) {
      tokens.push({ type: "operator", value: char as "+" | "-" | "*" | "/" });
      index++;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index++;
      continue;
    }

    throw new Error(`Invalid character: ${char}`);
  }

  return tokens;
}

function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  let position = 0;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  function parsePrimary(): number {
    const token = consume();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.type === "number") return token.value;

    if (token.type === "operator" && token.value === "-") return -parsePrimary();
    if (token.type === "operator" && token.value === "+") return parsePrimary();

    if (token.type === "identifier") {
      if (peek()?.type === "paren" && peek().value === "(") {
        consume();
        const value = parseAdditive();
        const close = consume();
        if (close?.type !== "paren" || close.value !== ")") throw new Error("Expected closing parenthesis");
        const fn = functions[token.value];
        if (!fn) throw new Error(`Unsupported function: ${token.value}`);
        return fn(value);
      }

      const value = constants[token.value];
      if (value === undefined) throw new Error(`Unsupported identifier: ${token.value}`);
      return value;
    }

    if (token.type === "paren" && token.value === "(") {
      const value = parseAdditive();
      const close = consume();
      if (close?.type !== "paren" || close.value !== ")") throw new Error("Expected closing parenthesis");
      return value;
    }

    throw new Error("Unexpected token");
  }

  function parseMultiplicative(): number {
    let value = parsePrimary();
    while (peek()?.type === "operator" && (peek().value === "*" || peek().value === "/")) {
      const operator = consume().value;
      const right = parsePrimary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseAdditive(): number {
    let value = parseMultiplicative();
    while (peek()?.type === "operator" && (peek().value === "+" || peek().value === "-")) {
      const operator = consume().value;
      const right = parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseAdditive();
  if (position < tokens.length) throw new Error("Unexpected trailing expression");
  if (!Number.isFinite(result)) throw new Error("Calculation did not produce a finite number");
  return result;
}

export const calculator: ToolDefinition = {
  name: "calculator",
  description: "Perform mathematical calculations (e.g., 2+2, sin(0.5) * 10).",
  parameters: z.object({
    expression: z.string().describe("The mathematical expression to evaluate."),
  }),
  execute: async ({ expression }) => {
    try {
      const result = evaluateExpression(expression);
      return { result };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};
