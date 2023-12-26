import WorldList from '#lostcity/engine/WorldList.js';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('index');
    });

    f.get('/title', async (req, res) => {
        let playerCount = 0;
        for (let world of WorldList) {
            playerCount += world.players;
        }

        return res.view('title', {
            playerCount
        });
    });

    f.get('/serverlist', async (req, res) => {
        if (typeof req.query['lores.x'] == 'undefined' && typeof req.query['hires.x'] == 'undefined') {
            return res.redirect(302, '/detail');
        }

        if (!req.query['lores.x'] && !req.query['hires.x']) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.method == 'undefined' || !req.query.method.length) {
            return res.redirect(302, '/detail');
        }

        let members = WorldList.filter(x => x.members).length;
        let regions = {
            'Central USA': 'us',
            'Germany': 'ger',
            'Local Development': 'uk'
        };
        let freeRegions = WorldList.filter(x => x.region && !x.members).map(x => x.region).filter((x, i, self) => self.indexOf(x) == i);
        let membersRegions = WorldList.filter(x => x.region && x.members).map(x => x.region).filter((x, i, self) => self.indexOf(x) == i);

        return res.view('serverlist', {
            detail: typeof req.query['hires.x'] !== 'undefined' ? 'high' : 'low',
            method: req.query.method,
            worlds: WorldList,
            members,
            regions,
            freeRegions,
            membersRegions
        });
    });

    f.get('/client', async (req, res) => {
        if (typeof req.query.detail == 'undefined' || !req.query.detail) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.world == 'undefined' || !req.query.world) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.method == 'undefined' || !req.query.method) {
            return res.redirect(302, '/detail');
        }

        let world = WorldList.find(x => x.id == req.query.world);
        if (!world) {
            return res.redirect(302, '/detail');
        }

        if (req.query.method == 0) {
            return res.view('webclient', {
                world,
                detail: req.query.detail,
                method: req.query.method,
            });
        } else if (req.query.method == 1) {
            return res.redirect('/client/rs2-client.jar');
        } else if (req.query.method == 2) {
            return res.view('javaclient', {
                world,
                detail: req.query.detail,
                method: req.query.method,
            });
        }
    });

    f.get('/client-inner', async (req, res) => {
        if (typeof req.query.detail == 'undefined' || !req.query.detail) {
            return;
        }

        if (typeof req.query.world == 'undefined' || !req.query.world) {
            return;
        }

        if (typeof req.query.method == 'undefined' || !req.query.method) {
            return;
        }

        let world = WorldList.find(x => x.id == req.query.world);
        if (!world) {
            return;
        }

        if (req.query.method == 0) {
            return res.view('webclient-inner', {
                world,
                detail: req.query.detail,
                method: req.query.method,
            });
        } else if (req.query.method == 2) {
            return res.view('javaclient-inner', {
                world,
                detail: req.query.detail,
                method: req.query.method,
            });
        }
    });

    f.get('/play', async (req, res) => {
        return res.redirect('/detail');
    });

    f.get('/cookies', async (req, res) => {
        return res.view('cookies');
    });

    f.get('/copyright', async (req, res) => {
        return res.view('copyright');
    });

    f.get('/detail', async (req, res) => {
        return res.view('detail');
    });

    f.get('/banner', async (req, res) => {
        return res.view('banner');
    });

    f.get('/manual', async (req, res) => {
        return res.view('manual');
    });

    f.get('/privacy', async (req, res) => {
        return res.view('privacy');
    });

    f.get('/support', async (req, res) => {
        return res.view('support');
    });

    f.get('/terms', async (req, res) => {
        return res.view('terms');
    });

    f.get('/whychoosers', async (req, res) => {
        return res.view('whychoosers');
    });

    f.get('/worldmap', async (req, res) => {
        return res.view('worldmap');
    });

    next();
}
