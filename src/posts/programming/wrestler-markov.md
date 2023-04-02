---
title: 'I created a Wrestler'
description: 'A Twitter bot that generates random wrestling promos from a fictional wrestler.'
keywords: 'twitter, markov chain, python, programming'
---

_His name is [Mitch Ragnarok](https://twitter.com/MitchRagnarok)_

Modern wrestling is a ridiculous combo of athleticism, improv, and melodrama. I love it, even if I
don't take it very seriously. My wife and I love to watch WWE pay-per-views. I especially love the
promos where the wrestlers bad mouth each other, so I decided to create a bot that could do the same
thing.

![Mitch's tweet](/images/programming/wrestler-markov/tweet.png)

The bot produces random sentences by using a Markov chain. A good explanation of how they work can
be seen [here](http://setosa.io/ev/markov-chains/).

I chose to use Python for the project. I'm new to the language but it's been pretty easy to pick up.
The best part about it is that there's a library for everything. That made it easy to find all the
resources I needed.

## To create the bot:

1. I used [Requests](http://docs.python-requests.org/en/master) and [Beautiful
   Soup](https://www.crummy.com/software/BeautifulSoup) to scrape over 1200 promos from
   [Cagematch](https://www.cagematch.net/).
2. I sorted out all the non-English promos using
   [langdetect](https://pypi.python.org/pypi/langdetect).
3. I formatted the text using the default [HTML
   parser](https://docs.python.org/2/library/htmlparser.html) and
   [regex](https://docs.python.org/2/library/re.html) search and replace.
4. I used [Markovify](https://github.com/jsvine/markovify) to create a Markov chain that would mix
   up the input text and spit out randomly generated sentences.
5. I used the [Twitter API](https://dev.twitter.com/index) and
   [python-twitter](https://github.com/bear/python-twitter) to post the tweets.
6. I set the twitter bot to post every 30 minutes using [cron](https://en.wikipedia.org/wiki/Cron).

When you're creating a Markov chain it's important to make sure that you're working with a large,
well-formatted body of text. How you decide to format the text is important; Large models can be too
big to open in a text editor, and manually formatting them would take quite a lot of time. Because
of these reasons, I formatted the input text programmatically.

## Here's the code to create the model:

```python
import requests
from bs4 import BeautifulSoup
from html import parser
from langdetect import detect
import re
import markovify

# I got this number by checking the id of the most recent promo
# total_promos_to_scrape = 1242
all_promos = ''

# iterate through all the promos
for i in range(1,1243):
    page = requests.get('http://www.cagematch.net/?id=93&nr=' + str(i))
    soup = BeautifulSoup(page.content, 'html.parser', from_encoding='cp1252')
    page_text = str(soup.find('div', class_='Text'))
    decoded_page_text = parser.unescape(page_text)

    # Some of the promos weren't in english, this conditional sorts them out
    if detect(decoded_page_text) == 'en':
        # Remove any spans in the text
        decoded_page_text = re.sub(r'<span\b[^>]*>(.*?)</span>', '', decoded_page_text)
        # Remove any line breaks in the text
        decoded_page_text = re.sub(r'<br/>', '', decoded_page_text)
        # Remove any emphasis or strong tags
        decoded_page_text = re.sub(r'<\/?[ib]>', '', decoded_page_text)
        # Remove single letters followed by — and other weird things
        decoded_page_text = re.sub(r'\s.—|[\'\"`,].[\'\"`,]', '', decoded_page_text)
        # Fix double/triple spaces)
        decoded_page_text = re.sub(r'\s{2,}', '', decoded_page_text)
        # Remove div tags
        decoded_page_text = re.sub(r'<\/?div.*?>', '', decoded_page_text)
        # Remove any random double quotes
        decoded_page_text = re.sub(r'"', '', decoded_page_text)
        # Fix missing whitespace at beginning of some sentences
        decoded_page_text = re.sub('([a-z]|\s?)([.,?!])([A-Z])', r'\1\2 \3', decoded_page_text)
        # Turn ... into an ellipse
        decoded_page_text = re.sub(r'\s?\.\.\.|\s?\.\s\.', '\u2026', decoded_page_text)
        # append the formatted promo to the big list
        all_promos += decoded_page_text

# Create the markov chain model, convert it to json, and write it to a file.
# This way we don't have to recreate this file each time; instead we just reconstitute it.
text_model = markovify.Text(all_promos, state_size=3)
model_json = text_model.to_json()
with open('/home/zelda/wrestling_corpus.txt', 'w') as text_file:
    text_file.write(model_json)
```

## Here's the script that posts to twitter:

```python
import markovify
from autocorrect import spell
import twitter

# Reconstitute the model
with open("/home/zelda/wrestling_corpus.txt", "rt") as file:
    text = ""
    for line in file:
        text += line
model =  markovify.Text.from_json(text)
corrected_text = spell(model.make_short_sentence(140))

# If you copy this code, you'll have to put your own info here
api = twitter.Api(consumer_key='{Redacted}'
                  consumer_secret='{Redacted}',
                  access_token_key='{Redacted}',
                  access_token_secret='{Redacted}')

# This posts the tweet and logs the text to console
status = api.PostUpdate(text_model.make_short_sentence(140))
print(status.text)
```

As you can see, it's actually fairly simple to build your own bot. Thanks to my wife Ashley for
creating Mitch's persona and profile pic. Please feel free to use my scripts as a template to make
your own bot.

I hope you enjoy [@MitchRagnarok](https://twitter.com/MitchRagnarok).
