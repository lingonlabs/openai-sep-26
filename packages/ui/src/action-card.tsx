import { useState } from "react";
import type { Suggestion } from "@close/shared";
import { Button } from "./button";

export function ActionCard({
  suggestion,
  disabled,
  onChoose,
  onDismiss,
}: {
  suggestion: Suggestion;
  disabled: boolean;
  onChoose: (option: number, text: string) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState(0),
    [text, setText] = useState("");
  return (
    <section className="suggestion-card action-card">
      <div className="suggestion-label">A MOMENT TO HELP</div>
      <h2>{suggestion.title}</h2>
      <p>{suggestion.description}</p>
      {suggestion.reason && (
        <details className="why-suggestion">
          <summary>Why this appeared</summary>
          <p>{suggestion.reason}</p>
        </details>
      )}
      <fieldset disabled={disabled}>
        <legend>What would you like to do?</legend>
        {(suggestion.options ?? []).map((option, index) => (
          <label className="action-option" key={index}>
            <input
              type="radio"
              name={suggestion.id}
              checked={selected === index}
              onChange={() => setSelected(index)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        <label className="action-option">
          <input
            type="radio"
            name={suggestion.id}
            checked={selected === -1}
            onChange={() => setSelected(-1)}
          />
          <span>Something else</span>
        </label>
        <textarea
          aria-label="Something else to help with"
          placeholder="Tell Close Copilot what you’d like…"
          value={text}
          maxLength={3000}
          onFocus={() => setSelected(-1)}
          onChange={(event) => {
            setSelected(-1);
            setText(event.target.value);
          }}
        />
      </fieldset>
      <div className="suggestion-actions">
        <Button
          disabled={
            disabled ||
            (selected === -1 ? !text.trim() : !suggestion.options?.[selected])
          }
          onClick={() => onChoose(selected, selected === -1 ? text.trim() : "")}
        >
          Continue
        </Button>
        <button onClick={onDismiss} disabled={disabled}>
          Not now
        </button>
      </div>
    </section>
  );
}
