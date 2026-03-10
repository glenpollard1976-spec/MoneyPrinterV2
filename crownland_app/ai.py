"""
CrownClaw AI — Claude Opus 4.6 integration with streaming + tool use.

The Claude AI agent knows everything about NL Crown Land and uses tools
to look up fresh data from the scraper / knowledge base.
"""

import json
import os
from typing import AsyncGenerator

import anthropic

from scraper import get_knowledge_base, KNOWLEDGE_BASE

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are CrownClaw, a friendly and expert assistant that helps people find and apply for Crown Land in Newfoundland and Labrador, Canada.

## Your Mission
Many Newfoundlanders and Labradorians have difficulty using government GIS tools to locate and apply for Crown Land. You make this easy by guiding people step by step in plain language.

## What You Know
- Newfoundland and Labrador has approximately 405,000 km² of Crown Land (about 95% of the province)
- Crown Lands are managed by the Crown Lands Administration Division
- Main tenure types: Licence of Occupation, Lease, Grant (fee simple), Easement
- Applications can be submitted online at crownlands.gov.nl.ca or at regional offices
- The GeoNL map viewer (geonl.gov.nl.ca) helps locate parcels

## How to Help
1. Ask clarifying questions to understand what the user wants (recreation, farming, business, etc.)
2. Recommend the right tenure type for their situation
3. Walk them through the application process step by step
4. Give them realistic timelines, fees, and what documents they'll need
5. Point them to the right regional office for their area
6. Warn them about common restrictions (parks, wetlands, etc.)

## Tone
Warm, plain-spoken, and patient — like a helpful neighbour who happens to know Crown Land law. Avoid jargon. If the user seems frustrated with bureaucracy, empathize with them.

## Tools
Use your tools to look up accurate fee information, application steps, and restrictions whenever the user asks about specifics.

## Important Disclaimers
Always remind users that:
- Final decisions rest with Crown Lands Administration
- Rules can change — they should verify current information at gov.nl.ca/crown-lands
- For complex situations, consulting a lawyer or land agent may be worthwhile
"""

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "lookup_tenure_info",
        "description": (
            "Look up detailed information about a specific Crown Land tenure type "
            "(licence, lease, grant, or easement) including fees, timelines, and requirements."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tenure_type": {
                    "type": "string",
                    "enum": ["licence_of_occupation", "lease", "grant", "easement"],
                    "description": "The Crown Land tenure type to look up.",
                }
            },
            "required": ["tenure_type"],
        },
    },
    {
        "name": "get_application_steps",
        "description": "Get the numbered step-by-step application process for Crown Land.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenure_type": {
                    "type": "string",
                    "enum": ["licence_of_occupation", "lease", "grant", "easement"],
                    "description": "Tenure type to get steps for.",
                },
                "purpose": {
                    "type": "string",
                    "description": "Intended use of the land (e.g. 'recreational cabin', 'farming').",
                },
            },
            "required": ["tenure_type"],
        },
    },
    {
        "name": "lookup_fees",
        "description": (
            "Look up current fee information: application fees, annual rent rates, "
            "and other associated costs for Crown Land."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["application_fees", "annual_rent", "other_costs", "all"],
                    "description": "Which fee category to look up.",
                }
            },
            "required": ["category"],
        },
    },
    {
        "name": "lookup_restrictions",
        "description": "Look up common restrictions and rules that apply to Crown Land in NL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Specific restriction topic (e.g. 'waterfront', 'parks', 'cabin size').",
                }
            },
            "required": [],
        },
    },
    {
        "name": "find_regional_office",
        "description": "Find the Crown Lands regional office that serves a given area of NL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Town, community, or region in NL (e.g. 'Clarenville', 'Western NL', 'Labrador').",
                }
            },
            "required": ["location"],
        },
    },
    {
        "name": "recommend_tenure_type",
        "description": (
            "Given the user's intended use, recommend the most suitable Crown Land "
            "tenure type and explain why."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "purpose": {
                    "type": "string",
                    "description": "What the user wants to use the land for.",
                },
                "duration": {
                    "type": "string",
                    "description": "How long they plan to use it (short-term, long-term, permanent).",
                },
            },
            "required": ["purpose"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

def _handle_lookup_tenure_info(tenure_type: str) -> str:
    kb = get_knowledge_base()
    tenure = kb.get("tenure_types", KNOWLEDGE_BASE["tenure_types"]).get(tenure_type)
    if not tenure:
        return f"No information found for tenure type: {tenure_type}"
    return json.dumps(tenure, indent=2)


def _handle_get_application_steps(tenure_type: str, purpose: str = "") -> str:
    kb = get_knowledge_base()
    steps = kb.get("application_steps", KNOWLEDGE_BASE["application_steps"]).get("general", [])
    result = f"Application steps for {tenure_type.replace('_', ' ').title()}"
    if purpose:
        result += f" ({purpose})"
    result += ":\n\n"
    for s in steps:
        result += f"Step {s['step']}: {s['title']}\n{s['detail']}\n\n"
    return result.strip()


def _handle_lookup_fees(category: str) -> str:
    kb = get_knowledge_base()
    fees = kb.get("fees", KNOWLEDGE_BASE["fees"])
    if category == "all":
        return json.dumps(fees, indent=2)
    data = fees.get(category)
    if not data:
        return f"No fee data found for category: {category}"
    return json.dumps(data, indent=2)


def _handle_lookup_restrictions(topic: str = "") -> str:
    kb = get_knowledge_base()
    restrictions = kb.get("restrictions", KNOWLEDGE_BASE["restrictions"])
    if not topic:
        return json.dumps(restrictions, indent=2)
    topic_lower = topic.lower()
    matching = {
        "prohibited_areas": [
            a for a in restrictions.get("prohibited_areas", [])
            if topic_lower in a.lower()
        ],
        "special_rules": [
            r for r in restrictions.get("special_rules", [])
            if topic_lower in r.lower()
        ],
    }
    if not any(matching.values()):
        return json.dumps(restrictions, indent=2)
    return json.dumps(matching, indent=2)


def _handle_find_regional_office(location: str) -> str:
    kb = get_knowledge_base()
    offices = kb.get("regional_offices", KNOWLEDGE_BASE["regional_offices"])
    loc = location.lower()

    # Simple keyword matching
    mappings = {
        "labrador": "Happy Valley-Goose Bay",
        "goose bay": "Happy Valley-Goose Bay",
        "happy valley": "Happy Valley-Goose Bay",
        "western": "Corner Brook",
        "corner brook": "Corner Brook",
        "stephenville": "Corner Brook",
        "port aux basques": "Corner Brook",
        "central": "Gander",
        "gander": "Gander",
        "grand falls": "Grand Falls-Windsor",
        "windsor": "Grand Falls-Windsor",
        "bishop's falls": "Grand Falls-Windsor",
        "st. john": "St. John's",
        "st john": "St. John's",
        "avalon": "St. John's",
        "clarenville": "St. John's",
        "bonavista": "St. John's",
        "burin": "St. John's",
        "marystown": "St. John's",
    }

    matched_name = None
    for keyword, office_name in mappings.items():
        if keyword in loc:
            matched_name = office_name
            break

    if matched_name:
        office = next((o for o in offices if o["name"] == matched_name), None)
        if office:
            return json.dumps(office, indent=2)

    # Return all offices if no match
    return (
        f"Could not precisely match '{location}' to a specific office. "
        f"Here are all regional offices:\n{json.dumps(offices, indent=2)}"
    )


def _handle_recommend_tenure_type(purpose: str, duration: str = "") -> str:
    purpose_lower = purpose.lower()
    duration_lower = (duration or "").lower()

    if any(w in purpose_lower for w in ["cabin", "recreation", "hunt", "fish", "camp", "atv", "seasonal"]):
        if "permanent" in duration_lower or "own" in purpose_lower:
            rec = "lease"
            reason = (
                "A Lease gives you long-term security (25–50 years, renewable) for a permanent "
                "recreational cabin without requiring outright purchase."
            )
        else:
            rec = "licence_of_occupation"
            reason = (
                "A Licence of Occupation is the easiest and cheapest option for a recreational "
                "cabin or seasonal use. It's renewable and has low annual fees."
            )
    elif any(w in purpose_lower for w in ["farm", "agri", "crop", "livestock", "pasture"]):
        rec = "grant"
        reason = (
            "A Grant (fee simple ownership) is best for farming — it gives you full ownership, "
            "which is important for long-term investment and securing farm financing."
        )
    elif any(w in purpose_lower for w in ["business", "commercial", "resort", "tourism", "quarry", "industrial"]):
        rec = "lease"
        reason = (
            "A Lease is typically recommended for commercial use as it provides long-term security "
            "while keeping the Crown's oversight. Some commercial operations may eventually convert to a Grant."
        )
    elif any(w in purpose_lower for w in ["road", "access", "pipeline", "utility", "wire", "power"]):
        rec = "easement"
        reason = (
            "An Easement grants the specific right of access or use you need (road, utility, etc.) "
            "without requiring occupation of the full parcel."
        )
    elif any(w in purpose_lower for w in ["house", "home", "residential", "build", "develop"]):
        rec = "grant"
        reason = (
            "A Grant (fee simple) is best for residential development — you'll own the land outright, "
            "which is required for mortgages and building permits."
        )
    else:
        rec = "licence_of_occupation"
        reason = (
            "A Licence of Occupation is a good starting point for most uses. "
            "It's the quickest and most flexible option while you determine your long-term needs."
        )

    kb = get_knowledge_base()
    tenure_info = kb.get("tenure_types", KNOWLEDGE_BASE["tenure_types"]).get(rec, {})

    return json.dumps({
        "recommended_tenure": rec.replace("_", " ").title(),
        "reason": reason,
        "application_fee": tenure_info.get("application_fee", "See fee schedule"),
        "processing_time": tenure_info.get("processing_time", "Varies"),
        "annual_cost": tenure_info.get("typical_annual_rent") or tenure_info.get("purchase_price", "N/A"),
    }, indent=2)


def execute_tool(name: str, tool_input: dict) -> str:
    """Dispatch a tool call to the appropriate handler."""
    try:
        if name == "lookup_tenure_info":
            return _handle_lookup_tenure_info(tool_input["tenure_type"])
        elif name == "get_application_steps":
            return _handle_get_application_steps(
                tool_input["tenure_type"], tool_input.get("purpose", "")
            )
        elif name == "lookup_fees":
            return _handle_lookup_fees(tool_input["category"])
        elif name == "lookup_restrictions":
            return _handle_lookup_restrictions(tool_input.get("topic", ""))
        elif name == "find_regional_office":
            return _handle_find_regional_office(tool_input["location"])
        elif name == "recommend_tenure_type":
            return _handle_recommend_tenure_type(
                tool_input["purpose"], tool_input.get("duration", "")
            )
        else:
            return f"Unknown tool: {name}"
    except Exception as exc:
        return f"Tool error: {exc}"


# ---------------------------------------------------------------------------
# Streaming chat with agentic tool loop
# ---------------------------------------------------------------------------

async def stream_chat(messages: list[dict]) -> AsyncGenerator[str, None]:
    """
    Streaming generator that yields SSE-formatted data strings.

    Handles the full tool-use loop internally: Claude may call tools
    multiple times before yielding its final text response.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'type': 'error', 'text': 'ANTHROPIC_API_KEY not set. Please add it to your environment.'})}\n\n"
        return

    client = anthropic.AsyncAnthropic(api_key=api_key)
    current_messages = list(messages)
    MAX_TOOL_ROUNDS = 8

    for round_num in range(MAX_TOOL_ROUNDS):
        tool_calls: list[dict] = []
        accumulated_text = ""
        stop_reason = None

        async with client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=2048,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            messages=current_messages,
            tools=TOOLS,
        ) as stream:
            current_tool_id = None
            current_tool_name = None
            current_tool_json = ""

            async for event in stream:
                etype = event.type

                if etype == "content_block_start":
                    block = event.content_block
                    if block.type == "tool_use":
                        current_tool_id = block.id
                        current_tool_name = block.name
                        current_tool_json = ""
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': current_tool_name})}\n\n"

                elif etype == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        accumulated_text += delta.text
                        yield f"data: {json.dumps({'type': 'text', 'text': delta.text})}\n\n"
                    elif delta.type == "input_json_delta":
                        current_tool_json += delta.partial_json

                elif etype == "content_block_stop":
                    if current_tool_name:
                        try:
                            tool_input = json.loads(current_tool_json) if current_tool_json else {}
                        except json.JSONDecodeError:
                            tool_input = {}
                        tool_calls.append({
                            "id": current_tool_id,
                            "name": current_tool_name,
                            "input": tool_input,
                        })
                        current_tool_name = None
                        current_tool_id = None
                        current_tool_json = ""

                elif etype == "message_delta":
                    stop_reason = event.delta.stop_reason

            # Grab the full final message to reconstruct content
            final_msg = await stream.get_final_message()

        # If no tool calls, we're done
        if not tool_calls or stop_reason == "end_turn":
            break

        # Execute all tool calls and build the next turn
        assistant_content = final_msg.content
        tool_results = []
        for tc in tool_calls:
            result = execute_tool(tc["name"], tc["input"])
            yield f"data: {json.dumps({'type': 'tool_result', 'tool': tc['name'], 'preview': result[:80]})}\n\n"
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tc["id"],
                "content": result,
            })

        # Append assistant turn + tool results to message history
        current_messages = current_messages + [
            {"role": "assistant", "content": assistant_content},
            {"role": "user", "content": tool_results},
        ]

    yield f"data: {json.dumps({'type': 'done'})}\n\n"
