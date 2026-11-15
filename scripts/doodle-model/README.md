# The doodle model (gs.doodle)

`src/kit/doodle-model.js` is made here; it isn't trained in CI. To change the things it knows, edit
`classes.json` (names from the [Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset),
CC BY 4.0) and copy the list into `THINGS` in `src/kit/doodle.js`, then:

```bash
pip install numpy torch
python3 scripts/doodle-model/fetch.py qd-data      # 7,000 drawings of each thing (28 x 28 bitmaps, 1.1 GB for 200 things)
EPOCHS=8 python3 scripts/doodle-model/train.py qd-data   # about 55 minutes on 4 CPU threads; writes src/kit/doodle-model.js and qd-data/report.json
npm run kit-test                                   # the doodle checks
```

The network is three 3x3 convolutions (32, 64, 128 channels, each with ReLU and 2x2 max pooling)
and two dense layers (256, then one per thing), stored as int8 with one scale per tensor (439 KB of
weights; the file is 589 KB as text, 379 KB compressed). `src/kit/doodle.js` reads the layer sizes
from the file, runs it in plain JavaScript and draws the player's strokes into the same kind of
28 x 28 picture the dataset uses.

With 200 things, on the 70,000 drawings held out of training (the int8 model, as shipped): 76.0%
right among all 200, 89.1% in its first three guesses, 96.1% right when asked to choose among five
(the thing and four others picked at random). Hardest among all 200: dog 31%, bear 33%, bird 33%,
frog 38%, raccoon 39%, tiger 40%, lobster 42%, mouse 45%, dragon 49%. `train.py` writes these
numbers to `qd-data/report.json`; update the ones in `docs/maker-kit.md` and `src/kit/doodle.js`
when the model is trained again. (With the first 46 things alone a smaller network was 90% right
among all 46.)

Those numbers are on the dataset's own 28 x 28 pictures. A game gives strokes, which `picture()` in
`src/kit/doodle.js` draws, so how it draws them matters as much as the model: on 2,100 real drawings
of 14 things the model never saw (the dataset's simplified strokes, nine of the things the look-alike
animals above), lines drawn 1.6 pixels out from their middle were named right 45 in 100 times among
all 200, and at 1.2 (`LINE`, what it is now) 60 in 100, 80 in the first three and 95 among five,
which is what the same things score on the dataset's own pictures. If the model is trained again
from other pictures, measure `LINE` again the same way before changing it.
