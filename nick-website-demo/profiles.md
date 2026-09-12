# Which profile each post is set in
#
# One line per post: the post's title, a colon, then the profile you want.
#
#     A Night in Mendocino: cipher
#
# Capitals, spaces and punctuation do not matter, so you can copy a title
# straight off the card on the front page. The short name from the post's web
# address works too, if that is easier to type.
#
# The profiles:
#
#     Foundry     a plain, still page — the one everything falls back to
#     Tidewater   a band of focus you drag down the page
#     Waterline   a single line of true alignment, everything else drifting
#     Lantern     a lit circle, the rest of the page in the dark
#     Ledger      lines ruled and set like an account book
#     Meniscus    scattered letters that gather where you tap
#     Cipher      characters resolving out of noise as they near the line
#     Marbles     black on white, with coloured glass drifting over the words
#     Percussion  black on white, still until you tap it and it goes off
#
# Three things decide how a post reads, and the most specific one wins:
#
#   1. Nothing said anywhere — the post is set in Foundry.
#   2. `profile:` written at the top of the post's own .md file.
#   3. A line in this file, which beats both.
#
# Rule 3 is what this file is for. A post that comes in from Substack has no
# .md file to write `profile:` into, so this is the only place to say how it
# should read. It also means you can overrule a post's own setting from here
# without opening it.
#
# To put every post in one profile no matter what else anything says, put the
# profile after `everything:` on a line of its own:
#
#     everything: cipher
#
# Delete a line and that post goes back to whatever it asked for itself.

How Nodes Can Fix Broken Networks: cipher
Magical Plugs in the Winter: lantern
Mad Men, Self-Actualization and Being Curious About Who You Want to Become: meniscus
Make 2025 The Year You Reclaim Your Attention: waterline
The Last American Bagholder: ledger

# Either way of naming a post works — this one is by the short name from its
# web address rather than by its title.
montana-and-wyoming-travel-log: tidewater
