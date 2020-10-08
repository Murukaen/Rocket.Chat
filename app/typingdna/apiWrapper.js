import { HTTP } from 'meteor/http';

const makeVerify = (user, pattern) => {
    const { data: {net_score : netScore} } = HTTP.post(`https://apidev.typingdna.com/verify/${user}`, {
        data: {tp: pattern},
        auth: '89fe60f493563dd67115f841f71a83e4:b3ad0256c82ea9a0f5b3639ccdf9d255',
    });

    return netScore;
};

const mapUser = username => {
    switch(username) {
        case 'Octa':
            return 'test1@typingdna.com';
    }

    return '';
}

const scoreThreshold = 50;

module.exports = {
    makeVerify,
    mapUser,
    scoreThreshold,
}
