# Support agent (24/7)

Spyvoo has its own 24/7 support chat in the corner of the dashboard and the website. The header says **Spyvoo Support**.
Behind it is a team of named teammates with smiling faces (by default Amara, Daniel, Sofia, Kenji, Zara and Lucas; change
the names in Admin → Support → Agent settings). Each customer always gets the same teammate, and that teammate
introduces themselves at the start of every conversation. It's the AI agent answering under that name: if a customer
sincerely asks whether it's a bot, it says so honestly and offers a human. It talks like a person texting:
- It greets by first name.
- It sends short separate messages, with typing dots sized to each one, so the reply never arrives as one block.
- The opener depends on the mood: playful when the customer is relaxed, straight to work when it's about money.

> Hi Tunde 👋 I’m Amara from Spyvoo Support 😊
> Thanks for contacting Spyvoo 👀
> I guess you’ve been spying good..
> Searches reset every day at midnight UTC. You’ve used 4 of your 10 today.

## What it knows
- **Everything about Spyvoo:** `content/support/knowledge.md` (features, dashboard map, limits and resets, plans, paying with crypto or local methods, refunds, account, teams, rules). Edit that file to teach it more. It's read on every message.
- **Live data:** plan prices and limits, the current offer, the payment methods this customer can see, billing settings, the refund policy text and company emails. This is always current, so nothing needs updating when you change a price in the admin.
- **This customer:** name, plan and end date, usage this day/month, team, email confirmed or not, and the last 8 orders. For each order it sees status, coin, transaction, whether it was underpaid, and the review note.
- **Your notes:** Admin → Support → Agent settings → "Extra things the agent must know". For example: "Bank transfer in Nigeria is paused this week."

## What it can do by itself
| Tool | When |
| --- | --- |
| `check_payment` | "I paid but my plan isn’t on". It asks Gatevoo again and switches the plan on at once if the coins arrived (the customer sees ✓ and confetti). It also sees the exact amount, address and expiry of an open checkout. |
| `get_account`, `get_orders` | A fresh look at the account and all orders |
| `resend_verification` | "I didn’t get the confirmation email" |
| `check_coupon` | "Does SPYLAUNCH work on Pro yearly?", including the final price and a ready checkout link |
| `discover_link` | "Where do I find crypto ads in Brazil?" It returns a ready search link and how many ads match |
| `handoff` | Refunds, email changes, suspended accounts, wrong-network crypto, a payment not found after checking, bugs, or the customer asks for a person |

It can't give plans, refunds, discounts or other people's data. Those tools don't exist, so no message can trick it
into it. If someone sincerely asks whether it is an AI, it says so and offers a person.

## Human hand-off
**When it hands a chat over:**
- Admins get an in-app notice, and an email goes to the support address (Admin → Settings → Company).
- The chat goes to the top of **Admin → Support → Needs a person**.

**In the admin:**
- Open the chat: the customer's account is one click away (**Account**).
- Reply as yourself. The agent goes quiet on that chat, and the customer gets a notification plus an email.
- **Hand back to agent** turns it on again. **Close** files the chat away.

## Settings (Admin → Support → Agent settings)
- **Switches:**
  - Support chat on/off.
  - Use AI. Off means basic mode: fixed answers, payment checks and hand-offs.
  - Chat on the website. Visitors before sign-up can ask about plans; they get no account access.
- **Name, label and look** (spy, host, guide or fan).
- **AI budgets per day:** per Free customer (40), per paying customer (300), website visitors together (400; also 20 per visitor), and everyone together (6,000). Past a budget, basic mode answers, so the chat never goes silent.

## Cost
It uses the AI provider set in Admin → Ad data & AI. Each customer message is one or two AI calls of about 6,000
input tokens:
- Claude Haiku: about $0.01 a message.
- OpenRouter's default Sonnet: about $0.04 a message.

Today's calls and cost show in Admin → Ad data & AI under the feature "support".

## Without an AI key
The basic agent still answers 24/7, by name and in separate messages:
- Payment questions: it runs the real payment check.
- Usage numbers and resets.
- Resending the confirmation email.
- Password help, "how do I cancel" (nothing to cancel), plans and prices.
- "Are you a bot?" (an honest answer).

Anything else is handed to a person.
