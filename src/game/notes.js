// Lore notes. US Expedition 1 ("Team Wren") — six surveyors who went through
// the Goaning Machine before you — plus scraps left by the Ririqian Remnants,
// Tufflandian liaisons and whoever else ended up down here.
// Notes are spawned by level generators by id; reading adds them to the journal.

export const NOTES = {
  l0_start: {
    title: 'To whoever wakes up here next',
    level: 'Level 0',
    body: `The machine dropped you here too. Don't panic — panic is loud.

1. CROUCH (C) when you hear clicking. The thing that clicks has no eyes. It hunts by sound.
2. Your flashlight is F. Batteries die. The dark is worse.
3. Drink water when you find it — clean if you can, dirty if you must. It steadies the nerves as much as the thirst.
4. Follow the arrows we painted. They lead to a pit where the carpet forgets to hold. Jump in.

We were six. Go faster than we did.
            — I.`,
  },
  lore_machine: {
    title: 'Operator\'s log — Site Kestrel',
    level: 'Level 0',
    body: `GOANING MACHINE — run 14 (Expedition 2)

Transfer nominal until T+6 s. Field coherence dropped at T+8. Chamber arrived — telemetry confirms — but the return coil burned out on the far side.

Note for whoever reads this down there: the machine is not a door. It is a needle. It pushes you through the web between Earth, the Goanrooms and the Tufferverse, and it only ever pushes one way unless the far coil is intact.

Expedition 1 never sent anything back either.`,
  },
  lore_ririq: {
    title: 'Ririqian pamphlet (damp)',
    level: 'Level 1',
    body: `THE BROTHERHOOD ENDURES

In 2013 the faithful Remnant crossed beyond the reach of Tufflandia's tanks and Tufflandia's lies. Supreme Leader RUCKY RUCKY walked first into the dark, and the dark made way for him.

Citizens of the Goanrooms: you are guests in the Remnant's house. Report outsiders. Report Americans. Report anyone carrying a radio.

GLORY TO RIRIQIA BELOW.`,
  },
  lore_tuff: {
    title: 'Briefing excerpt — Tufflandian liaison',
    level: 'Level 2',
    body: `(stamped TUFFLANDIA — MINISTRY OF THE EXTERIOR — copy for the US delegation)

...the Ririqian Brotherhood did not dissolve in 2013. Its leadership and several thousand loyalists entered the structure our scientists call the Goanrooms. We have no means to follow them. You do.

We ask only that your expeditions report sightings of the Remnant and of Supreme Leader Rucky Rucky. We do not recommend contact. We do not recommend the lower levels.`,
  },
  lore_rucky: {
    title: 'Remnant patrol order',
    level: 'Level 3',
    body: `PATROL 7 — STANDING ORDERS

1. The pools are the Leader's. Do not swim in them.
2. The American machine-people have come through again. Take their radios. Take their maps.
3. If you see the Leader's light on the water, kneel.
4. Do not go up the long stair. Nobody who goes up the long stair comes back down to say what is at the top.`,
  },
  l0_a: {
    title: 'Scout log — Kesh',
    level: 'Level 0',
    body: `Saw it properly today. Tall. Office-thin. No eyes at all — just two folds of skin on the sides of its head like wet paper ears.

We call it the Hush because that's what you do when it's near.

It finds you by your footsteps. Sprinting is a dinner bell. Gunfire is worse. Walk on the carpet like it's thin ice and it will pass you by close enough to touch.`,
  },
  l0_b: {
    title: 'Medical notes — Dot',
    level: 'Level 0',
    body: `Pim had another episode. Said the walls were breathing. Two sips of clean water and he settled.

Observations:
- Darkness wears you down. Stay near the lights when you can.
- Sanity is a resource like water. Ration your nerves.
- Bandages: heal slow, but they heal.`,
  },
  l0_c: {
    title: 'Leader\'s log — Ines',
    level: 'Level 0',
    body: `Counted four hundred identical rooms. Room four hundred and one was different: the carpet sagged near the far wall, damp and dark, and the lights there stuttered like they were nervous.

Marcus thinks it's a sinkhole into the next layer. The arrows we leave will point there. Lights flicker more the closer you get — trust that.`,
  },
  l0_d: {
    title: 'Scrawled on the back of a receipt',
    level: 'Level 0',
    body: `it is not quiet here
the hum has words in it if you stop moving long enough
i stopped moving
it said my name
it said it wrong
            — pim`,
  },
  l0_e: {
    title: 'MEMO — Facilities',
    level: 'Level 0',
    body: `TO: All Staff
RE: Lighting, Sector 7

Do not replace the fluorescent tubes in Sector 7.
They replace themselves.

Do not count the rooms.
Do not answer the doors that knock from your side.

Thank you for your continued cooperation.`,
  },
  gen_a: {
    title: 'Torn page',
    level: 'Anywhere',
    body: `If you see one of us standing still at the end of a hall — don't wave.

It isn't us. It wears our clothes the way water wears a glass.

Look straight at it and it can't move. Look away and it comes closer. Light makes it go.`,
  },
  gen_b: {
    title: 'Pencil on cardboard',
    level: 'Anywhere',
    body: `Rumour from another wanderer: a hundred levels down there's an aquarium run by a rat they call Big Cheese, and a soldier called Rucky Rucky who never came back.

Not our problem. Our problem is the bridge.`,
  },
  gen_c: {
    title: 'Index card',
    level: 'Anywhere',
    body: `Things that help:
· Glowsticks: throw them ahead, see what's waiting.
· Music boxes: wind it, throw it, walk the other way.
· Lockers: they can't find what they didn't see go in.`,
  },

  l1_a: {
    title: 'Engineer\'s notebook — Marcus',
    level: 'Level 1',
    body: `Service tunnels. Brick, pipe, steam. Someone kept these machines running for no one.

The way out is a SERVICE DOOR — heavy, sealed, keycard reader still lit. There's a keycard somewhere down here: foremen kept them in their offices. Look for a room with a desk and a hazard-striped door frame.`,
  },
  l1_b: {
    title: 'Field report — Halvard',
    level: 'Level 1',
    body: `Marrowhounds. Dogs made of bone and nothing else. They hunt in pairs, sometimes threes.

They hate fire. I lit a rag and they wouldn't come within three metres. Road flares work better. A lighter will do in a pinch — hold it out and back away slowly.

Bullets work too. Make them count.`,
  },
  l1_c: {
    title: 'Warning sign (hand-copied)',
    level: 'Level 1',
    body: `DANGER — HIGH PRESSURE STEAM
DO NOT LOITER NEAR VENTS
DO NOT FEED THE DOGS

(someone has added: "they're not dogs")`,
  },
  l1_d: {
    title: 'Scout log — Kesh',
    level: 'Level 1',
    body: `Found a pack of them gnawing on a pipe. They don't eat. They don't need to. They just gnaw, for hours, until the pipe bursts.

The orange lights hum different here. Lower. Like something big breathing in the walls.`,
  },
  l1_e: {
    title: 'SHIFT LOG 4471',
    level: 'Level 1',
    body: `Keycard misplaced AGAIN.
Whoever keeps taking the service keycard to the break room: stop.
It goes back to the FOREMAN'S OFFICE.

Also stop leaving the furnace doors open. The dogs like the warmth.`,
  },

  l2_a: {
    title: 'Leader\'s log — Ines',
    level: 'Level 2',
    body: `Offices above, sewers beneath. Stairs go down into the dark water channels and come back up somewhere else.

The exit is a STAIRWELL, sealed behind a powered door. The fuse box beside it is empty. Maintenance kept spare FUSES — Marcus says check the sewer pump rooms.`,
  },
  l2_b: {
    title: 'Medical notes — Dot',
    level: 'Level 2',
    body: `Halvard is gone.

The Inkwalker took him. Black bones, tall as the doorframes, walks like a puppet with half its strings cut. It does not stop. It does not tire. It does not lose interest.

Only light makes it flinch. Put your flashlight beam right on its skull — focus it — and it freezes up for a few seconds. Then RUN.`,
  },
  l2_c: {
    title: 'Receipt, both sides',
    level: 'Level 2',
    body: `the phones ring at night
i picked one up
it was my own voice
it said "don't pick up"
            — pim`,
  },
  l2_d: {
    title: 'MEMO — Building Services',
    level: 'Level 2',
    body: `REMINDER: Employees must not enter sublevel drains after hours.

Employees must not follow ink stains on the carpet.

Employees who see a tall dark colleague in the stairwell should remain at their desks with the lamp ON.`,
  },
  l2_e: {
    title: 'Scout log — Kesh',
    level: 'Level 2',
    body: `Ink stains on the carpet in long trails. Fresh ones are wet. Follow them away, not toward.

The sewer channels are faster than the offices if you don't mind the smell. Ladders and stairs everywhere.`,
  },

  l3_a: {
    title: 'Engineer\'s notebook — Marcus',
    level: 'Level 3',
    body: `The pools are warm. The water is too clear — you can see the bottom ten metres down. You can see everything.

Except the thing that swims there. You don't see it until it's close.`,
  },
  l3_b: {
    title: 'Medical notes — Dot',
    level: 'Level 3',
    body: `Rules for the pools:
· Stay out of deep water when you hear gurgling.
· The Undertow ambushes from below. It can reach a little way out of the water — keep a few steps back from the edge when it's hunting.
· On dry tile you are mostly safe. Mostly.
· Underwater you have about fifteen seconds of air. Count.`,
  },
  l3_c: {
    title: 'Leader\'s log — Ines',
    level: 'Level 3',
    body: `The way out is the MAIN DRAIN at the bottom of the deepest pool. The grate is locked by a valve — the DRAIN VALVE KEY should be in a pump room, they're the ones with the machinery humming behind tiled walls.

Swim down. Hold your breath. Don't look around too much.`,
  },
  l3_d: {
    title: 'Water-stained page',
    level: 'Level 3',
    body: `the skylights show a sky that isn't there
blue, with no sun
i asked marcus where the light comes from
he didn't answer
he was staring at the water
            — pim`,
  },

  l4_a: {
    title: 'Survey card, US Expedition 2',
    level: 'Level 4',
    body: `LEVEL 4 — provisional name "the Quiet Rooms".

Beige walls, gray carpet, ceiling the colour of old mint. Windows everywhere, and every one of them shows daylight. There is no outside. We checked: behind the glass is plaster.

Stay near the windows. The dark between them is where the snakes are.

Do NOT shoot the platinum snakes unless you have to. Every round that hits one makes it faster. A knife does not seem to wind them up.`,
  },
  l4_b: {
    title: 'Napkin, restaurant 3',
    level: 'Level 4',
    body: `table for six
we were six

i keep seeing someone standing behind the windows when i'm tired
they never wave
i stopped waving`,
  },
  l4_c: {
    title: 'Toll room — field notes',
    level: 'Level 4',
    body: `The vault behind the steel door has a door marked 5 in it. The lock beside the vault wants the plates pressed in an order.

Some locks HUM the order — press "Listen" and watch which plate lights.
Some have a PLAQUE with the words in order. One word is always scratched out; it's whichever plate is left over.

Get it wrong and it buzzes loud enough to bring things.

The order changed when we came back. Everything resets if you leave.
If you find one of the heavy "5" bridge keys, it opens a vault without the lock.`,
  },

  // ---- Ririqian bases (lore is translated for you; the walls are not)
  rq_missing: {
    title: 'Internal circular (translated)',
    level: 'Ririqian base',
    body: `BROTHERHOOD COMMAND — RESTRICTED

It has now been NINE MONTHS since the Supreme Leader was last seen by any loyal eye.

Officers will continue to read the Leader's daily address at morning assembly. Officers will NOT discuss where the addresses come from. Any soldier who asks whether the Leader is alive is to be assigned to the lower pools.

The Leader is not missing. The Leader is elsewhere, on business of the State.`,
  },
  rq_portal: {
    title: 'Scrawled on the back of a ration card',
    level: 'Ririqian base',
    body: `Haddik says he saw it. The Leader's guard walked him into the big room on Gug where the air shimmers, and the Leader stepped into it and was gone.

Haddik says it was a door to the Tufferverse. Haddik says the Leader went to take back what Tufflandia stole.

Haddik was sent to the pools the next morning.

I believe Haddik.`,
  },
  rq_orders: {
    title: 'Standing orders (translated)',
    level: 'Ririqian base',
    body: `1. Outsiders are to be shot on sight. Americans especially.
2. The alarm is to be sounded at the first sighting. Do not wait for an officer.
3. The vault key stays on the base commander's person at all times.
4. Do not shoot at the thin ones on Gug. You will only make them faster. Hide.
5. Glory to Ririqia Below.`,
  },
  rq_rations: {
    title: 'Quartermaster\'s ledger (translated)',
    level: 'Ririqian base',
    body: `Fire salts: 412 pouches (down 60)
Clean water: 96 drums (filters failing)
Rifle rounds: 7,800
Generator fuel: 11 drums — REQUEST RESUPPLY
Gray goo: confiscated, 40 bottles. Men keep drinking it on watch.

Resupply has not come in eleven weeks.`,
  },
  rq_doubt: {
    title: 'A letter that was never sent',
    level: 'Ririqian base',
    body: `Mother,

We came down here in 2013 because the Leader said Tufflandia would never follow. He was right. Nobody followed. Nobody comes at all, except the Americans with their machine, and they don't come for us.

The Leader is gone. The officers say "elsewhere". The men say "the Tufferverse". I say we are guarding empty rooms for a man who left.

I am still saluting the portraits. Everyone is. That is the worst part.`,
  },
  rq_radio: {
    title: 'Radio log (translated)',
    level: 'Ririqian base',
    body: `0400 — Outpost 9 reports contact with American scouts. Two killed. Their machine-radio recovered.
0415 — Outpost 9 not responding.
0600 — Outpost 9 not responding.
0900 — Patrol sent. Patrol reports Outpost 9 empty. No bodies. Doors open. Gate intact.
0905 — Command orders log entry 0400-0900 struck from the record.`,
  },
  rq_propaganda: {
    title: 'Morning address no. 271 (translated)',
    level: 'Ririqian base',
    body: `"Brothers! The rooms are endless, but so is our will. Tufflandia believed it had buried us; instead it planted us. Every corridor we hold is a corridor of Ririqia. Every door we seal is a border.

I am with you always — in the portraits, in the flag, in the morning silence before the generators start.

Glory to Ririqia Below."

(Address 271 is word-for-word the same as address 12.)`,
  },
  rq_prisoner: {
    title: 'Carved into the cell wall',
    level: 'Ririqian base',
    body: `SGT. D. ALVAREZ — US EXPEDITION 1 — TEAM WREN
DAY 40

they keep asking where the machine is
i tell them it's on the other side
they think i'm lying

if you're from kestrel: they don't know the way back either
nobody does`,
  },
  // ---- abandoned Didystani bases
  dd_last: {
    title: 'Last entry — Didystani garrison log',
    level: 'Didystani base',
    body: `Day 311. The pools are rising. Three more men did not return from the water detail.
Day 312. Something in the deep pools. Not the Undertow. Bigger.
Day 313. We sealed the gate. It does not need the gate.
Day 314.`,
  },
  dd_orders: {
    title: 'Didystani field orders',
    level: 'Didystani base',
    body: `BY ORDER OF THE DIRECTORATE OF DIDYSTAN

This post is to be held until relieved. Relief will come via the long stair. Under no circumstances is the long stair to be climbed by garrison personnel.

Sniper teams are to keep the watch posts manned at all hours. Ammunition is to be conserved: one shot, one kill.`,
  },
  dd_overrun: {
    title: 'Scrawled in grease pencil on a map',
    level: 'Didystani base',
    body: `NOT THE RIRIQIANS
NOT THE WATER
IT CAME UP THROUGH THE FLOOR TILES
DO NOT SLEEP NEAR THE DRAINS`,
  },
  dd_diary: {
    title: 'A soldier\'s diary',
    level: 'Didystani base',
    body: `Didystan sent us down before the Brotherhood ever came. We were here first. That should mean something.

Now the Ririqians hold the offices above and the halls of Gug, and we hold a few tiled rooms that smell of chlorine and rot.

Korrin found a door marked 4 at the top of the long stair. He went through. He did not come back. Neither did the sound of his footsteps.`,
  },
  dd_pools: {
    title: 'Quartermaster\'s note',
    level: 'Didystani base',
    body: `Water from the clear pools is NOT safe however clean it looks. Boil it or purify it.
The blue halls are off-limits after the incident.
Remaining stock: 2 marksman rifles, 40 rounds, 1 medkit, 12 tins of blueberry salts.
Nobody is coming.`,
  },
  // ---- Did'h Wanderers
  didh_scripture: {
    title: 'The Sayings of Did\'h',
    level: 'Did\'h camp',
    body: `Did'h sleeps in the warm places, so we seek the warm places.
Did'h knocks things from tables, so we do not cling to things.
Did'h comes when he wishes and leaves when he wishes, so we wander.
Did'h wears his own name upon his chest, so that he will never forget it.

Do not forget your name.`,
  },
  didh_trade: {
    title: 'A Wanderer\'s trade list',
    level: 'Did\'h camp',
    body: `Will trade:
- salts for juice
- scrap for batteries
- Ririqian gold for medicine (gold is pretty, Did'h likes pretty)
- charms for anyone who is kind

Will not trade:
- with anyone who raises a hand to a Wanderer. Did'h remembers.`,
  },
  didh_wander: {
    title: 'Note pinned under a stone',
    level: 'Did\'h camp',
    body: `We are the Wanderers. We do not hold rooms, we pass through them. We do not fight unless we are struck.

The Brotherhood calls us mad. The Brotherhood salutes a portrait of a man who walked into the air and vanished. We salute a cat who is right here, on the wall, wearing a shirt.

Who is mad?`,
  },

  l5_a: {
    title: 'Leader\'s log — Ines',
    level: 'Level 5',
    body: `The bridge. No end in sight in either direction, and no railings in places. The fog beneath has no floor.

Kesh fell. We didn't hear him land.

Stay in the middle. The wind pushes.`,
  },
  l5_b: {
    title: 'Last page of a notebook',
    level: 'Level 5',
    body: `it's at the end of the bridge
the goaner
goat face. wasp body. bone legs. big as a bus
it owns this place
it bleats like a goat when it's hurt
i heard it bleat once
            — pim`,
  },
  l5_c: {
    title: 'Engineer\'s notebook — Marcus',
    level: 'Level 5',
    body: `The arena platform has floodlight towers, still wired. Switches at the base.

When the light hits it, the plates on its back split open and you can see the glowing sac underneath. That's where it bleeds. In the dark, bullets just skip off the chitin.

It will try to break the lights. Keep them on.`,
  },
  l5_d: {
    title: 'Ines — final entry',
    level: 'Level 5',
    body: `If you're reading this, we didn't make it.

Kill it and the bridge lets you go. I'm sure of it.

I have to be.`,
  },
};
