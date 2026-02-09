# Mermaid Rendering Test

## Flowchart (Top-Down)

```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great]
    B -->|No| D[Debug]
    D --> B
    C --> E[Done]
```

## Flowchart (Left-Right)

```mermaid
graph LR
    A[Input] --> B[Process]
    B --> C[Output]
    B --> D[Log]
```

## Sequence Diagram

```mermaid
sequenceDiagram
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice
    Alice->>Bob: How are you?
    Bob-->>Alice: Good thanks
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Running: start
    Running --> Idle: stop
    Running --> Error: fail
    Error --> Idle: reset
```

## Class Diagram

```mermaid
classDiagram
    Animal <|-- Dog
    Animal <|-- Cat
    Animal : +String name
    Animal : +eat()
    Dog : +bark()
    Cat : +meow()
```

## ER Diagram

```mermaid
erDiagram
    USER ||--o{ POST : writes
    POST ||--|{ COMMENT : has
    USER ||--o{ COMMENT : writes
```

## Invalid (should fallback to raw source)

```mermaid
this is not valid mermaid at all
```

## Regular code block (unaffected)

```typescript
function hello(): string {
  return "world";
}
```
