const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3008, () => {
      console.log("Server Running at http://localhost:3008/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//User Register API
app.post("/register/", async (request, response) => {
  const { username, password, name, gander } = request.body;
  const checkUser = `select username from user where username = ${username};`;
  const dbUser = await db.run(checkUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length <= 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `
            INSERT INTO
              user (username, password, name, gender)
            VALUES (
                "${username}",
                "${password}",
                "${name}",
                "${gender}"
            );`;
      await db.run(requestQuery);
      response.status(200);
      response.send("User created Successfully");
    }
  }
});

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPassword = await bcrypt.compare(password, dbUser.password);
    if (isPassword === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({
        jwtToken,
      });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//Authentication Token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowerId = await db.all(getFollowerIdQuery);

    const getFollowerIdSimple = getFollowerId.map((eachUser) => {
      return eachUser.following_user_id;
    });

    const getTweetsFeedQuery = `
    SELECT
      user.username,
      tweet.tweet,
      tweet.date_time AS dateTime
    FROM
      user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
      user.user_id in (${getFollowerIdSimple});
    ORDER BY
      tweet.date_time DESC
    LIMIT 4;`;
    const tweetsFeedArray = await db.all(getTweetsFeedQuery);
    response.send(tweetsFeedArray);
  }
);

//API-4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerId = await db.all(getFollowerIdQuery);

  const getFollowerIds = getFollowerId.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getFollowersResultQuery = `SELECT name FROM user WHERE user_id in (${getFollowerIds})`;
  const followerResults = await db.all(getFollowersResultQuery);
  response.send(followerResults);
});

//API-5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerId = await db.all(getFollowerIdQuery);

  const getFollowerIds = getFollowerId.map((eachUser) => {
    return eachUser.following_user_id;
  });
  console.log(`${getFollowerIds}`);

  const getFollowerNamesQuery = `SELECT name FROM user WHERE user_id in (${getFollowerIds})`;
  const followersNames = await db.all(getFollowerNamesQuery);
  response.send(followersNames);
});

//API-6
const apiOutput = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.data_time,
  };
};

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerId = await db.all(getFollowerIdQuery);

  const getFollowerIds = getFollowerId.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${getFollowerId});`;
  const tweetIdsArray = await db.get(getTweetIdsQuery);
  const followingTweetIds = tweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likeCountQuery = `select count(user_id) as likes from like where tweet_id = ${tweetId};`;
    const likeCount = await db.get(likeCountQuery);

    const replyCountQuery = `select count(user_id) as replies from reply where tweet_id = ${tweetId};`;
    const replyCount = await db.get(replyCountQuery);

    const tweetDataQuery = `select tweet, date_time from tweet where tweet_id = ${tweetId};`;
    const tweetData = await db.get(tweetDataQuery);
    response.send(apiOutput(tweetData, likeCount, replyCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
const convertLikeUserNameDBObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowerId = await db.all(getFollowerIdQuery);
    const getFollowerIds = getFollowerId.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${getFollowerId});`;
    const tweetIdsArray = await db.get(getTweetIdsQuery);
    const tweetIds = tweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (tweetIds.includes(parseInt(tweetId))) {
      const getLikedUserNameQuery = `select user.username as likes from user inner join like
    on user.user_id = like.user_id where like.tweet_id = ${tweetId};`;
      const likedUserArray = await db.get(getLikedUserNameQuery);

      const getLikedUserNames = getLikedUserNameQuery.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(convertLikeUserNameDBObject(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8
const convertUserNameReplayedDBObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `select user_id from user where username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id = ${getUserId.user_id};`;
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    console.log(getFollowingIds);
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id= reply.user_id
        where reply.tweet_id = ${tweetId};`;
      const getUsernameReplyTweets = await db.all(getUsernameReplyTweetsQuery);
      response.send(convertUserNameReplayedDBObject(getUsernameReplyTweets));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username = ${username};`;
  const getUserId = await db.get(getUserIdQuery);
  const getTweetIdsQuery = `select tweet_id from tweet where user_id = ${getUserId.user_id};`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });
  console.log(getTweetIds);
  response.send(getTweetIds);
});

//API-10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username = ${username};`;
  const getUserId = await db.get(getUserIdQuery);
  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet (tweet, user_id, date_time) values ("${tweet}", "${getUserId.user_id}", "${currentDate.date_time}");`;

  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//API-11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `select user_id from user where username = ${username};`;
    const getUserId = await db.get(getUserIdQuery);
    const getTweetListQuery = `select tweet_id from tweet where user_id = ${getUserId.user_id};`;
    const getUserTweetListArray = await db.all(getTweetIdsQuery);
    const getUserTweetList = getUserTweetListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetList);
    if (getUserTweetList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
