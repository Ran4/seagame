I want to implement a new feature, let's discuss it. Game design first (but do look at code to figure out roughly how to implement it).

I want to implement a command system, that can be used to for example inject commands externally.
It can also be used by actors to store future actions, to persist them to disk etc.

Best understood from example:

```json
[
    // Go to sleep
    {
        name: "Sleep",
    },
    // eat
    {
        name: "Eat",
    },
    // Kiss actor 34
    {
        name: "Kiss",
        actorId: 34
    },
    // order actor 4 to kiss actor 34
    {
        name: "Order",
        actorId: 4,
        order: {
            name: "Kiss",
            actorId: 39
        }
    },
    // Tell actor something (must be nearby)
    {
        name: "Tell",
        actorId: 4,
        text: "I like eggs!"
    }
]
```

Visual representation is like:

Sleep {}
Kiss {actorId: 43}
Order {actorId: 4, order: Kiss {actorId: 39}}
Tell {actorId: 4, text: "I like eggs"}
