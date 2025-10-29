# Sales Simulator Guide

Test the LinkedIn Sales Agent AI by role-playing as a student prospect.

## Quick Start

```bash
cd ai_module
python test_sales_simulator.py
```

## How It Works

The simulator lets you test the AI's sales capabilities by playing the role of a high school student responding to the sales agent.

### Starting Point

You start with this initial message already sent:

```
hey Ivan, I'm currently looking at what students at lynbrook are working on
outside of school, like nonprofits, research, internships, or passion projects.
Are you working on any great projects or ideas?
```

### Your Role

You're playing the part of a high school student prospect. React naturally to the AI's messages:

- **Be interested** - Ask questions, show curiosity
- **Be busy** - Mention school workload, other commitments
- **Be uncertain** - Express doubts about cost, time, value
- **Be excited** - Show interest in programs, opportunities
- **Be realistic** - Mix positive and negative reactions

### Example Responses

**As a student interested in coding:**

```
Yeah! I'm building a mobile app for my school. Just started last month.
```

**As a busy student:**

```
I've been working on a research project for the science fair, but I'm swamped
with AP classes right now
```

**As an uncertain prospect:**

```
I'm interested but not sure if I have the time or money for something like that
```

**As an enthusiastic prospect:**

```
That sounds amazing! I've been wanting to start a nonprofit, tell me more!
```

## Commands

Type these special commands during the conversation:

- **`analyze`** - Show AI's analysis of the conversation (phase, engagement, sentiment)
- **`history`** - View the full conversation history
- **`ai`** - Force the AI to generate a response
- **`exit`** - Quit the simulator

## What to Look For

As you test, observe:

1. **Timing** - Does the AI wait for proper engagement before selling?
2. **Tone** - Are messages short, friendly, and natural?
3. **Personalization** - Does the AI reference your responses?
4. **Transition** - When does it move from rapport to sell phase?
5. **Objections** - How does it handle your concerns?

## Testing Scenarios

Try these different personas:

### Scenario 1: Enthusiastic Builder

- Respond with excitement about your projects
- Ask lots of questions
- Show high engagement
- See if AI capitalizes on your interest

### Scenario 2: Busy Student

- Constantly mention being busy
- Express time concerns
- Show interest but hesitation
- See how AI handles objections

### Scenario 3: Skeptical Prospect

- Question cost and value
- Express doubts
- Ask tough questions
- See if AI builds trust

### Scenario 4: Not Sure

- Give vague responses
- Be non-committal
- Slow to respond
- See if AI re-engages

## Conversation Phases

The AI moves through these phases:

1. **Initial** - First contact, gauge interest
2. **Rapport Build** - Build relationship through questions
3. **Sell Trigger** - Introduce Prodicity when engagement peaks
4. **Handle Response** - Address objections or questions
5. **Close** - Final ask for application

You'll see phase transitions as the conversation develops.

## Tips

- **Be realistic** - Respond like an actual high school student would
- **Mix it up** - Try both positive and negative responses
- **Use commands** - Check `analyze` to see what phase you're in
- **Watch metrics** - Engagement and sentiment scores
- **Test boundaries** - Push the AI's limits, see how it handles edge cases

## Success Metrics

A successful sales conversation should:

- Stay short and friendly (under 200 chars per message)
- Build rapport before selling
- Address your concerns naturally
- Transition to sell at the right time
- Make you want to learn more

Enjoy testing!

