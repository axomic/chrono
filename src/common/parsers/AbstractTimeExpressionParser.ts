import { Parser, ParsingContext } from "../../chrono";
import { ParsingComponents, ParsingResult } from "../../results";
import { Meridiem } from "../../index";
import dayjs from "dayjs";

function primaryTimePattern(primaryPrefix: String, primarySuffix: String) {
    return new RegExp(
        "(^|\\s|T)" +
            `${primaryPrefix}` +
            "(\\d{1,4})" +
            "(?:" +
            "(?:\\.|\\:|\\：)(\\d{1,2})" +
            "(?:" +
            "(?:\\:|\\：)(\\d{2})(?:\\.(\\d{1,6}))?" +
            ")?" +
            ")?" +
            "(?:\\s*(a\\.m\\.|p\\.m\\.|am?|pm?))?" +
            `${primarySuffix}`,
        "i"
    );
}

function followingTimeExpression(followingPhase: String, followingSuffix: String) {
    return new RegExp(
        `^(${followingPhase})` +
            "(\\d{1,4})" +
            "(?:" +
            "(?:\\.|\\:|\\：)(\\d{1,2})" +
            "(?:" +
            "(?:\\.|\\:|\\：)(\\d{1,2})(?:\\.(\\d{1,6}))?" +
            ")?" +
            ")?" +
            "(?:\\s*(a\\.m\\.|p\\.m\\.|am?|pm?))?" +
            `${followingSuffix}`,
        "i"
    );
}

const HOUR_GROUP = 2;
const MINUTE_GROUP = 3;
const SECOND_GROUP = 4;
const MILLI_SECOND_GROUP = 5;
const AM_PM_HOUR_GROUP = 6;

export abstract class AbstractTimeExpressionParser implements Parser {
    abstract primaryPrefix(): string;
    abstract followingPhase(): string;

    primarySuffix(): string {
        return "(?=\\W|$)";
    }

    followingSuffix(): string {
        return "(?=\\W|$)";
    }

    pattern(context: ParsingContext): RegExp {
        return primaryTimePattern(this.primaryPrefix(), this.primarySuffix());
    }

    extract(context: ParsingContext, match: RegExpMatchArray): ParsingResult {
        const refDate = dayjs(context.refDate);
        let result = context.createParsingResult(match.index + match[1].length, match[0].substring(match[1].length));

        result.start.imply("day", refDate.date());
        result.start.imply("month", refDate.month() + 1);
        result.start.imply("year", refDate.year());

        result.start = this.extractPrimaryTimeComponents(context, match);
        if (!result.start) {
            match.index += match[0].length;
            return null;
        }

        const remainingText = context.text.substring(match.index + match[0].length);
        const followingPattern = followingTimeExpression(this.followingPhase(), this.followingSuffix());
        match = followingPattern.exec(remainingText);
        if (!match) {
            return result;
        }

        // Pattern "YY.YY -XXXX" is more like timezone offset
        if (match[0].match(/^\s*([+-])\s*\d{3,4}$/)) {
            return result;
        }

        const newResult = AbstractTimeExpressionParser.extractEndTimeComponent(result.clone(), match);
        return newResult ? newResult : result;
    }

    extractPrimaryTimeComponents(context: ParsingContext, match: RegExpMatchArray): null | ParsingComponents {
        const components = context.createParsingComponents();
        let hour = 0;
        let minute = 0;
        let meridiem = null;

        // ----- Hours
        hour = parseInt(match[HOUR_GROUP]);

        // ----- Minutes
        if (match[MINUTE_GROUP] != null) {
            minute = parseInt(match[MINUTE_GROUP]);
        } else if (hour > 100) {
            minute = hour % 100;
            hour = Math.floor(hour / 100);
        }

        if (minute >= 60 || hour > 24) {
            return null;
        }

        if (hour >= 12) {
            meridiem = Meridiem.PM;
        }

        // ----- AM & PM
        if (match[AM_PM_HOUR_GROUP] != null) {
            if (hour > 12) return null;
            const ampm = match[AM_PM_HOUR_GROUP][0].toLowerCase();
            if (ampm == "a") {
                meridiem = Meridiem.AM;
                if (hour == 12) {
                    hour = 0;
                }
            }

            if (ampm == "p") {
                meridiem = Meridiem.PM;
                if (hour != 12) {
                    hour += 12;
                }
            }
        }

        components.assign("hour", hour);
        components.assign("minute", minute);

        if (meridiem !== null) {
            components.assign("meridiem", meridiem);
        } else {
            if (hour < 12) {
                components.imply("meridiem", Meridiem.AM);
            } else {
                components.imply("meridiem", Meridiem.PM);
            }
        }

        // ----- Millisecond
        if (match[MILLI_SECOND_GROUP] != null) {
            const millisecond = parseInt(match[MILLI_SECOND_GROUP].substring(0, 3));
            if (millisecond >= 1000) return null;

            components.assign("millisecond", millisecond);
        }

        // ----- Second
        if (match[SECOND_GROUP] != null) {
            const second = parseInt(match[SECOND_GROUP]);
            if (second >= 60) return null;

            components.assign("second", second);
        }

        return components;
    }

    private static extractStartTimeComponent(result: ParsingResult, match: RegExpMatchArray): ParsingResult | null {
        let hour = 0;
        let minute = 0;
        let meridiem = null;

        // ----- Hours
        hour = parseInt(match[HOUR_GROUP]);

        // ----- Minutes
        if (match[MINUTE_GROUP] != null) {
            minute = parseInt(match[MINUTE_GROUP]);
        } else if (hour > 100) {
            minute = hour % 100;
            hour = Math.floor(hour / 100);
        }

        if (minute >= 60 || hour > 24) {
            return null;
        }

        if (hour >= 12) {
            meridiem = Meridiem.PM;
        }

        // ----- AM & PM
        if (match[AM_PM_HOUR_GROUP] != null) {
            if (hour > 12) return null;
            const ampm = match[AM_PM_HOUR_GROUP][0].toLowerCase();
            if (ampm == "a") {
                meridiem = Meridiem.AM;
                if (hour == 12) {
                    hour = 0;
                }
            }

            if (ampm == "p") {
                meridiem = Meridiem.PM;
                if (hour != 12) {
                    hour += 12;
                }
            }
        }

        result.start.assign("hour", hour);
        result.start.assign("minute", minute);

        if (meridiem !== null) {
            result.start.assign("meridiem", meridiem);
        } else {
            if (hour < 12) {
                result.start.imply("meridiem", Meridiem.AM);
            } else {
                result.start.imply("meridiem", Meridiem.PM);
            }
        }

        // ----- Millisecond
        if (match[MILLI_SECOND_GROUP] != null) {
            const millisecond = parseInt(match[MILLI_SECOND_GROUP].substring(0, 3));
            if (millisecond >= 1000) return null;

            result.start.assign("millisecond", millisecond);
        }

        // ----- Second
        if (match[SECOND_GROUP] != null) {
            const second = parseInt(match[SECOND_GROUP]);
            if (second >= 60) return null;

            result.start.assign("second", second);
        }

        return result;
    }

    private static extractEndTimeComponent(result: ParsingResult, match: RegExpMatchArray): ParsingResult | null {
        result.end = result.start.clone();

        // ----- Millisecond
        if (match[MILLI_SECOND_GROUP] != null) {
            const millisecond = parseInt(match[MILLI_SECOND_GROUP].substring(0, 3));
            if (millisecond >= 1000) return null;

            result.end.assign("millisecond", millisecond);
        }

        // ----- Second
        if (match[SECOND_GROUP] != null) {
            const second = parseInt(match[SECOND_GROUP]);
            if (second >= 60) return null;

            result.end.assign("second", second);
        }

        let hour = parseInt(match[HOUR_GROUP]);
        let minute = 0;
        let meridiem = -1;

        // ----- Minute
        if (match[MINUTE_GROUP] != null) {
            minute = parseInt(match[MINUTE_GROUP]);
        } else if (hour > 100) {
            minute = hour % 100;
            hour = Math.floor(hour / 100);
        }

        if (minute >= 60 || hour > 24) {
            return null;
        }

        if (hour >= 12) {
            meridiem = Meridiem.PM;
        }

        // ----- AM & PM
        if (match[AM_PM_HOUR_GROUP] != null) {
            if (hour > 12) {
                return null;
            }

            const ampm = match[AM_PM_HOUR_GROUP][0].toLowerCase();
            if (ampm == "a") {
                meridiem = Meridiem.AM;
                if (hour == 12) {
                    hour = 0;
                    if (!result.end.isCertain("day")) {
                        result.end.imply("day", result.end.get("day") + 1);
                    }
                }
            }

            if (ampm == "p") {
                meridiem = Meridiem.PM;
                if (hour != 12) hour += 12;
            }

            if (!result.start.isCertain("meridiem")) {
                if (meridiem == Meridiem.AM) {
                    result.start.imply("meridiem", Meridiem.AM);

                    if (result.start.get("hour") == 12) {
                        result.start.assign("hour", 0);
                    }
                } else {
                    result.start.imply("meridiem", Meridiem.PM);

                    if (result.start.get("hour") != 12) {
                        result.start.assign("hour", result.start.get("hour") + 12);
                    }
                }
            }
        }

        result.text = result.text + match[0];
        result.end.assign("hour", hour);
        result.end.assign("minute", minute);

        if (meridiem >= 0) {
            result.end.assign("meridiem", meridiem);
        } else {
            const startAtPM = result.start.isCertain("meridiem") && result.start.get("meridiem") == Meridiem.PM;
            if (startAtPM && result.start.get("hour") > hour) {
                // 10pm - 1 (am)
                result.end.delete("meridiem");
                result.end.imply("meridiem", Meridiem.AM);
            } else if (hour > 12) {
                result.end.delete("meridiem");
                result.end.imply("meridiem", Meridiem.PM);
            }
        }

        if (result.end.date().getTime() < result.start.date().getTime()) {
            result.end.imply("day", result.end.get("day") + 1);
        }

        return result;
    }
}
