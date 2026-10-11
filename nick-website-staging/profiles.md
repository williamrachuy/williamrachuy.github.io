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
#     Fracture    black on white, still until you tap it and it cracks apart
#
# Three layers decide how a post reads, highest priority first:
#
#   1. `profile:` written at the top of the post's own .md file.
#   2. A line in this file.
#   3. Nothing said anywhere — the post is set in Foundry.
#
# Layer 2 is what this file is for. A post that comes in from Substack has no
# .md file to write `profile:` into, so this is the only place to say how it
# should read. A post that does have a .md file keeps whatever that file says;
# a line here will not overrule it.
#
# To change the default from Foundry for every post that has no more specific
# setting, put the profile after `everything:` on a line of its own:
#
#     everything: cipher
#
# Delete a line and that post goes back to Foundry (or to `everything:`).

# Staging: every Substack post is given a profile here so the site reads the
# way the real one will. Posts with their own .md file set theirs at the top of
# that file, which beats anything in this list.

how-nodes-can-fix-broken-networks: ledger
my-favorite-content-from-2025: marbles
magical-plugs-in-the-winter: fracture
montana-and-wyoming-travel-log: meniscus
how-to-tell-if-your-content-diet: cipher
mad-men-self-actualization-and-being: foundry
bite-sized-book-reviews-abundance: lantern
how-substack-should-use-algorithms: waterline
14-conversation-starters-for-americas: tidewater
make-2025-the-year-you-reclaim-your: ledger
why-culture-has-drifted-to-the-right: tidewater
billionaire-influence-as-americas: meniscus
5-painful-truths-about-america-for: fracture
a-broadcast-from-the-front-the-current: cipher
the-last-american-bagholder: lantern
